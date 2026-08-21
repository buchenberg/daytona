# GAP Plugin Interface (pseudocode)

Extracted from [mikekelly/gap](https://github.com/mikekelly/gap) source code.

---

## Plugin definition

```
plugin {
    name:                      string       // required, display name
    matchPatterns:             []string     // required, host/path patterns (alias: "match")
    credentialSchema:          []string | { fields: []field }  // required
    transform:                 function(request, credentials) -> request  // required
    weight:                    int          // optional, default 0, higher wins
    dangerously_permit_http:   bool         // optional, default false
}

field {
    name:      string   // required, credential key name
    label:     string   // optional, UI metadata
    type:      string   // optional, UI metadata ("password", "text")
    required:  bool     // optional, UI metadata
}
```

ES6 `export default { ... }` is rewritten to `var plugin = { ... }` before loading.

---

## transform(request, credentials) -> request

```
// Input request
request {
    method:   string              // "GET", "POST", etc.
    url:      string              // full URL: "https://api.example.com/v1/chat?page=1"
    headers:  map[string]string   // { "Content-Type": "application/json", ... }
    body:     []byte              // byte array, empty [] if no body
}

// Input credentials — flat map loaded from encrypted DB by plugin ID
credentials {
    [field_name]: string          // keys from credentialSchema, values always strings
}

// Return value — same shape as request, validated by host
return {
    method:   string              // required
    url:      string              // required
    headers:  map[string]string   // required
    body:     string | []byte     // required, string auto-converted to UTF-8 bytes
}
```

A fresh JS interpreter (Boa) is created per request. No persistent state between invocations.

---

## Host/path pattern matching

```
pattern format:  host[:port][/path[*]]

matches(pattern, request_host, request_port, request_path):
    // host matching
    if pattern_host starts with "*."
        match single subdomain only
        "*.example.com" matches "foo.example.com"
        "*.example.com" does NOT match "a.b.example.com"
        "*.example.com" does NOT match "example.com"
    else
        exact match only

    // port matching
    if pattern specifies port
        request_port must match exactly
    else
        any port matches

    // path matching
    if pattern has path component
        if path ends with "*"
            prefix match: "/v1/*" matches "/v1/chat", "/v1/completions"
        else
            exact match: "/v1/chat" matches only "/v1/chat"
    else
        any path matches
```

Examples:

- `api.example.com` — any port, any path
- `api.example.com:8080` — port 8080 only, any path
- `api.example.com/v1/*` — any port, path prefix `/v1/`
- `*.example.com/api/*` — wildcard host + path prefix

---

## Handler priority

Plugins and header sets compete in the same priority system. One winner per request.

```
select_handler(matching_plugins, matching_header_sets):
    candidates = merge(matching_plugins, matching_header_sets)
    sort by:
        1. highest weight first (int, default 0)
        2. oldest created_at first (tiebreaker)
    return candidates[0]  // single winner, only one handler applied
```

---

## GAP.crypto

```
sha256(data: string | []byte) -> []byte
    // 32-byte SHA-256 hash

sha256Hex(data: string | []byte) -> string
    // 64-char lowercase hex SHA-256

hmac(key: string | []byte, data: string | []byte, encoding?: string) -> string | []byte
    // HMAC-SHA256
    // encoding: "hex" (default) -> hex string
    //           "base64"        -> base64 string
    //           anything else   -> raw []byte

sign(algorithm: string, keyDer: []byte, data: string | []byte) -> []byte
    // algorithm: "ed25519" | "ecdsa-p256" | "rsa-pss-sha256" | "rsa-pkcs1-sha256"
    // keyDer: PKCS#8 DER-encoded private key
    // returns raw signature bytes

verify(algorithm: string, pubKeyDer: []byte, signature: []byte, data: string | []byte) -> bool
    // same algorithms as sign
    // pubKeyDer: DER-encoded public key
    // returns true/false, never throws on bad signature

httpSignature(options) -> { signatureInput: string, signature: string }
    // RFC 9421 HTTP Message Signatures
    options {
        request:      request object   // required, must have .method, .url, .headers
        components:   []string         // required, e.g. ["@method", "@authority", "content-type"]
        algorithm:    string           // required, same values as sign()
        keyId:        string           // required, identifier for verifier
        keyDer:       []byte           // required, PKCS#8 DER private key
        label:        string           // optional, default "sig1"
        created:      int              // optional, unix seconds, default now()
    }

    // component resolution:
    //   "@method"     -> request.method.toUpperCase()
    //   "@target-uri" -> request.url
    //   "@authority"  -> parsed URL host
    //   "@path"       -> parsed URL pathname
    //   "@query"      -> parsed URL search (with "?")
    //   other         -> case-insensitive header lookup (throws if missing)

    // returns:
    //   signatureInput: 'sig1=("@method" "content-type");created=1704067200;keyid="my-key";alg="ed25519"'
    //   signature:      'sig1=:<base64-encoded-signature>:'
```

---

## GAP.util

```
base64(data: string | []byte) -> string              // encode
base64(data: string, decode: true) -> []byte          // decode

hex(data: string | []byte) -> string                  // encode lowercase
hex(data: string, decode: true) -> []byte             // decode

now() -> int                                          // UTC millis since epoch
isoDate(ms: int) -> string                            // "2024-01-01T00:00:00.000Z"
amzDate(ms: int) -> string                            // "20240101T000000Z" (AWS format)
```

---

## GAP.log

```
log(msg: any) -> void
    // string   -> as-is
    // number   -> String(msg)
    // boolean  -> String(msg)
    // null     -> "null"
    // object   -> JSON.stringify(msg), fallback String(msg)
    // Accumulated in internal array, retrievable by host
    // Single log level only (no debug/warn/error)
```

---

## Sandbox restrictions

Blocked by explicit stubs (throw on call):

- `fetch`, `XMLHttpRequest`
- `eval`
- `Function` constructor

Blocked by engine (Boa has no browser/Node APIs):

- `require`, `import`, `fs`, `child_process`, `net`, `os`
- `setTimeout`, `setInterval`
- `document`, `window`, `console`

Available:

- `TextEncoder` / `TextDecoder` (polyfill)
- `URL` / `URLSearchParams` (polyfill)
- `JSON`, `Math`, `String`, `Array`, `Object`, etc.

No execution timeout. No memory limits. Infinite loop blocks the proxy thread.

---

## Header sets (no-code alternative)

```
header_set {
    id:              uuid           // DB-generated
    match_patterns:  []string       // same pattern format as plugins
    weight:          int            // same priority system as plugins
    headers:         map[string]string  // injected into matching requests
}

// Always requires TLS (no dangerously_permit_http opt-out)
// Zero configured headers -> request blocked
// Header values are treated as credentials for audit log scrubbing
```

---

## Credential flow at proxy time

```
1. Agent sends HTTPS request through CONNECT tunnel with Bearer token
2. Proxy authenticates token, checks scopes (host, path, method, port)
3. Match request against all plugins + header sets by host/port/path
4. Select single winner by weight (highest) then age (oldest)
5. If plugin:
     a. Load credentials from encrypted DB for this plugin ID
     b. If no credentials configured -> block request (403)
     c. Create fresh Boa JS context with sandbox
     d. Load plugin source, execute transform(request, credentials)
     e. Validate returned request shape
     f. Forward transformed request upstream
6. If header set:
     a. Load headers from DB for this header set ID
     b. If no headers configured -> block request (403)
     c. Inject headers into request
     d. Forward request upstream
7. Scrub credential values from audit log (literal, base64, hex, basic auth)
8. Return response to agent
```
