CLANG ?= clang

# bpf2go reads BPF2GO_CFLAGS from the environment.
# Detect platform-specific include paths for BPF compilation.
BPF_CFLAGS := -O2 -g -Wall

# asm/ headers live in arch-specific dir on Debian/Ubuntu.
ARCH_INCLUDE := $(wildcard /usr/include/$(shell uname -m)-linux-gnu)
ifdef ARCH_INCLUDE
  BPF_CFLAGS += -I$(ARCH_INCLUDE)
endif

# libbpf headers: prefer system libbpf-dev, fall back to kernel headers.
ifeq ($(wildcard /usr/include/bpf/bpf_helpers.h),)
  LIBBPF_INCLUDE := $(wildcard /usr/src/linux-headers-$(shell uname -r)/tools/bpf/resolve_btfids/libbpf/include)
  ifdef LIBBPF_INCLUDE
    BPF_CFLAGS += -I$(LIBBPF_INCLUDE)
  endif
endif

export BPF2GO_CFLAGS := $(BPF_CFLAGS)

# Unit-testable packages (excludes pkg/jail which needs root).
TEST_PKGS := ./pkg/firewall/ ./pkg/proxy/

.PHONY: generate build clean test test-unit test-e2e

generate:
	go generate ./pkg/firewall/...

build: generate
	CGO_ENABLED=0 go build -o bin/netleash ./cmd/netleash

test: test-unit test-e2e

test-unit:
	@mkdir -p coverage
	go test -race -coverprofile=coverage/unit.out -covermode=atomic $(TEST_PKGS)

test-e2e:
	@mkdir -p coverage
	go test -v -count=1 -coverprofile=coverage/e2e.out ./pkg/jail/

clean:
	rm -rf bin
	rm -f pkg/firewall/firewall_bpf*.go pkg/firewall/firewall_bpf*.o
	rm -f pkg/firewall/firewalltc_bpf*.go pkg/firewall/firewalltc_bpf*.o
	rm -f pkg/firewall/firewalllsm_bpf*.go pkg/firewall/firewalllsm_bpf*.o
