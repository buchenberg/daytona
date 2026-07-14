package proxy

import "time"

const (
	proxyMaxRetries = 3
	proxyBaseDelay  = 150 * time.Millisecond
	proxyMaxDelay   = 1 * time.Second
)
