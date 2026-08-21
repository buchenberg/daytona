package firewall

//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -cc clang firewall bpf/firewall.c
//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -cc clang firewallTc bpf/firewall_tc.c
//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -cc clang firewallLsm bpf/firewall_lsm.c
