#ifndef COMMON_H
#define COMMON_H

#include <linux/bpf.h>
#include <linux/ip.h>
#include <linux/udp.h>
#include <linux/tcp.h>
#include <linux/if_ether.h>
#include <linux/in.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

// ---------------------------------------------------------------------------
// Shared structs and maps
// ---------------------------------------------------------------------------

// Max DNS name length in wire format (including final null label).
// Kept at 128 to stay within verifier complexity budget for nested loops.
// Covers domain names up to ~120 chars which handles virtually all real domains.
#define MAX_DNS_NAME_LEN 128

// event->action: was the packet let through or dropped.
#define EV_ALLOWED 1
#define EV_BLOCKED 0

// event->reason: why the decision was made. Lets userspace log every egress
// request (and DNS learning) with a human-readable cause.
#define EV_REASON_IP_ALLOWED 1           // dst IP was learned from an allowed domain's DNS answer
#define EV_REASON_IP_BLOCKED 2           // dst IP is not in the allow list
#define EV_REASON_DNS_ALLOWED_EXACT 3    // DNS query for an explicitly allowed domain
#define EV_REASON_DNS_ALLOWED_WILDCARD 4 // DNS query matched an allowed wildcard domain
#define EV_REASON_DNS_BLOCKED 5          // DNS query for a domain not in the allow list
#define EV_REASON_DNS_LEARNED 6          // ingress: learned an A-record IP for an allowed domain
#define EV_REASON_DNS_ALLOWED_INTERNAL 7 // DNS query for a cluster-internal zone, passed through to the resolver
#define EV_REASON_IP_ALLOWED_INBOUND 8   // egress reply on a connection a remote peer initiated into the workload

// Event sent to userspace describing one egress decision. `name` carries the
// queried domain in DNS wire format for DNS/learn events and is empty otherwise.
struct event {
	__u32 dst_ip;
	__u16 dst_port;
	__u8 protocol;
	__u8 action; // EV_ALLOWED / EV_BLOCKED
	__u8 reason; // EV_REASON_*
	char name[MAX_DNS_NAME_LEN];
} __attribute__((packed));

// Hash map of allowed destination IPv4 addresses.
// Key: IPv4 address in network byte order. Value: 1.
struct {
	__uint(type, BPF_MAP_TYPE_HASH);
	__type(key, __u32);
	__type(value, __u8);
	__uint(max_entries, 10000);
} allowed_ips SEC(".maps");

// Ring buffer for sending egress-decision events to userspace.
struct {
	__uint(type, BPF_MAP_TYPE_RINGBUF);
	__uint(max_entries, 256 * 1024);
} events SEC(".maps");

// Tracks the last decision reported per destination IP so verbose logging emits
// one event per (IP, verdict) instead of one per packet. LRU so it self-evicts
// under churn. Populated and read only by the eBPF egress program.
struct {
	__uint(type, BPF_MAP_TYPE_LRU_HASH);
	__type(key, __u32);  // dst IPv4 (network byte order)
	__type(value, __u8); // last reported EV_REASON_*
	__uint(max_entries, 10000);
} reported_ips SEC(".maps");

// Key for the allowed_domains map — DNS wire-format name, lowercased, zero-padded.
struct dns_name_key {
	char name[MAX_DNS_NAME_LEN];
} __attribute__((packed));

// Hash map of allowed domains in DNS wire format (lowercased).
// Key: DNS wire-format name (e.g., \x07example\x03com\x00), zero-padded.
// Value: 1 (presence = domain is allowed).
struct {
	__uint(type, BPF_MAP_TYPE_HASH);
	__type(key, struct dns_name_key);
	__type(value, __u8);
	__uint(max_entries, 1000);
} allowed_domains SEC(".maps");

// Hash map of wildcard-allowed parent domains in DNS wire format.
// For "*.github.com", the key is the wire format of "github.com".
// Ingress program strips labels from the queried name and checks suffixes here.
struct {
	__uint(type, BPF_MAP_TYPE_HASH);
	__type(key, struct dns_name_key);
	__type(value, __u8);
	__uint(max_entries, 1000);
} allowed_wildcards SEC(".maps");

// Key for the inbound_conns connection-tracking map. Identifies one TCP
// connection. The fields are filled so that an egress reply's
// (daddr, dest, source) produces the same key as the inbound SYN's
// (saddr, source, dest), letting egress match the connection the peer opened.
struct conn_key {
	__u32 remote_ip;   // peer IP, network byte order
	__u16 remote_port; // peer port, network byte order
	__u16 local_port;  // workload's listening port, network byte order
} __attribute__((packed));

// Tracks connections a remote peer initiated *into* the workload (it sent a
// SYN). The ingress program records them; the egress program allows reply
// traffic to these peers so workload-as-server services (SSH/terminal, toolbox,
// preview ports) keep working under a domain allow list. LRU self-evicts.
struct {
	__uint(type, BPF_MAP_TYPE_LRU_HASH);
	__type(key, struct conn_key);
	__type(value, __u8);
	__uint(max_entries, 65536);
} inbound_conns SEC(".maps");

// Cluster-internal DNS zones (e.g. "cluster.local"), in DNS wire format. DNS
// queries whose name is a subdomain of one of these are passed through to the
// resolver instead of dropped: such names resolve authoritatively inside the
// cluster and never recurse to the public internet, so allowing the query is
// exfil-safe — while dropping them breaks Kubernetes search-domain resolution of
// allowed external domains. Keyed like allowed_wildcards (suffix match).
struct {
	__uint(type, BPF_MAP_TYPE_HASH);
	__type(key, struct dns_name_key);
	__type(value, __u8);
	__uint(max_entries, 64);
} internal_dns_zones SEC(".maps");

// DNS header (12 bytes) — RFC 1035 Section 4.1.1
struct dns_header {
	__u16 id;
	__u16 flags;
	__u16 qdcount;
	__u16 ancount;
	__u16 nscount;
	__u16 arcount;
};

// Max answer RRs to parse (verifier bound).
#define MAX_ANSWER_RRS 16

// Max label levels to check for wildcard suffix matching (e.g., a.b.c.example.com = 5).
#define MAX_WILDCARD_LABELS 10

static __always_inline char to_lower(__u8 c) {
	if (c >= 'A' && c <= 'Z')
		return c + ('a' - 'A');
	return c;
}

// emit_event pushes one decision event to userspace. When `name` is non-NULL
// (DNS / learn events) the queried domain is copied in; otherwise it is zeroed.
static __always_inline void emit_event(__u8 action, __u8 reason, __u32 dst_ip,
                                       __u16 dst_port, __u8 protocol,
                                       const struct dns_name_key *name) {
	struct event *e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
	if (!e)
		return;
	e->dst_ip = dst_ip;
	e->dst_port = dst_port;
	e->protocol = protocol;
	e->action = action;
	e->reason = reason;
	if (name)
		__builtin_memcpy(e->name, name->name, sizeof(e->name));
	else
		__builtin_memset(e->name, 0, sizeof(e->name));
	bpf_ringbuf_submit(e, 0);
}

// emit_ip_decision reports an IP-level egress verdict, de-duplicated per
// (dst_ip, verdict): a steady flow logs once instead of once per packet, and a
// changed verdict re-emits. `l3_off` is the byte offset of the IP header in skb
// (0 for cgroup_skb, ETH_HLEN for TC). The destination port is best-effort.
static __always_inline void emit_ip_decision(struct __sk_buff *skb, int l3_off,
                                             __u32 dst_ip, const struct iphdr *ip,
                                             __u8 action, __u8 reason) {
	__u8 *last = bpf_map_lookup_elem(&reported_ips, &dst_ip);
	if (last && *last == reason)
		return; // already reported this verdict for this destination
	bpf_map_update_elem(&reported_ips, &dst_ip, &reason, BPF_ANY);

	__u16 dst_port = 0;
	int l4_off = l3_off + ip->ihl * 4;
	if (ip->protocol == IPPROTO_TCP) {
		struct tcphdr tcp;
		if (bpf_skb_load_bytes(skb, l4_off, &tcp, sizeof(tcp)) == 0)
			dst_port = tcp.dest;
	} else if (ip->protocol == IPPROTO_UDP) {
		struct udphdr udp;
		if (bpf_skb_load_bytes(skb, l4_off, &udp, sizeof(udp)) == 0)
			dst_port = udp.dest;
	}
	emit_event(action, reason, dst_ip, dst_port, ip->protocol, NULL);
}

#endif // COMMON_H
