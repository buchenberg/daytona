// SPDX-License-Identifier: GPL-2.0
// eBPF LSM program for process execution whitelisting.
//
// Attaches globally to lsm/bprm_check_security. Only enforces the whitelist
// for processes inside the target cgroup (identified by cgroup ID stored in a map).
// Processes outside the target cgroup are always allowed.
//
// Requires CONFIG_BPF_LSM=y and "bpf" in the kernel LSM list.

#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>
#include <bpf/bpf_core_read.h>

// Minimal BTF-compatible definition of linux_binprm.
// Only the 'filename' field is needed; CO-RE relocates the offset at load time.
struct linux_binprm {
	const char *filename;
} __attribute__((preserve_access_index));

// Maximum path length we compare. Paths longer than this are truncated.
#define MAX_PATH_LEN 256

// Key for the allowed_execs map — null-terminated path, zero-padded.
struct exec_path_key {
	char path[MAX_PATH_LEN];
} __attribute__((packed));

// Hash map of allowed executable paths.
struct {
	__uint(type, BPF_MAP_TYPE_HASH);
	__type(key, struct exec_path_key);
	__type(value, __u8);
	__uint(max_entries, 1000);
} allowed_execs SEC(".maps");

// Single-element array storing the target cgroup ID.
struct {
	__uint(type, BPF_MAP_TYPE_ARRAY);
	__type(key, __u32);
	__type(value, __u64);
	__uint(max_entries, 1);
} target_cgroup_id SEC(".maps");

// Ring buffer for exec events to userspace.
struct {
	__uint(type, BPF_MAP_TYPE_RINGBUF);
	__uint(max_entries, 64 * 1024);
} exec_events SEC(".maps");

// Event sent to userspace when an exec is blocked.
struct exec_event {
	char path[MAX_PATH_LEN];
	__u8 action; // 0 = blocked
};

SEC("lsm/bprm_check_security")
int BPF_PROG(exec_filter, struct linux_binprm *bprm, int ret)
{
	// If a previous LSM already denied this, respect that decision.
	if (ret != 0)
		return ret;

	// Check if current process is in the target cgroup.
	__u32 zero = 0;
	__u64 *target_id = bpf_map_lookup_elem(&target_cgroup_id, &zero);
	if (!target_id)
		return 0; // No target set, allow everything.

	__u64 current_cgroup = bpf_get_current_cgroup_id();
	if (current_cgroup != *target_id)
		return 0; // Not our cgroup, allow.

	// Read the filename (absolute path) from the binprm struct.
	struct exec_path_key key = {};
	const char *filename;
	filename = BPF_CORE_READ(bprm, filename);
	bpf_probe_read_str(key.path, MAX_PATH_LEN, filename);

	// Check if the binary is in the allowed list.
	__u8 *allowed = bpf_map_lookup_elem(&allowed_execs, &key);
	if (allowed)
		return 0; // Allowed.

	// Emit a blocked event to userspace.
	struct exec_event *evt = bpf_ringbuf_reserve(&exec_events, sizeof(*evt), 0);
	if (evt) {
		__builtin_memcpy(evt->path, key.path, MAX_PATH_LEN);
		evt->action = 0;
		bpf_ringbuf_submit(evt, 0);
	}

	return -1; // EPERM — block execution.
}

char _license[] SEC("license") = "GPL";
