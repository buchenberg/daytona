```
┌───────────────────────────────────────────────────────────────────────────┐
│                                  HOST                                     │
│                                                                           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                    │
│  │   Bridge    │    │ Host Veth   │    │ Host Veth   │                    │
│  │ 10.100.0.1  │    │10.100.1.1/16│    │10.100.1.3/16│   ┌─────────────┐  │
│  │   fcbr0     │────┤veth-sandbox1├────┤veth-sandbox2├───┤   Internet  │  │
│  │             │    │             │    │             │   │             │  │
│  └─────────────┘    └─────────────┘    └─────────────┘   └─────────────┘  │
│                              │                  │                         │
└──────────────────────────────┼──────────────────┼─────────────────────────┘
                               │                  │
                               │                  │
                    ┌──────────▼──────────┐    ┌──▼─────────────────┐
                    │      NETNS 1        │    │      NETNS 2       │
                    │  sandbox-sandbox1   │    │  sandbox-sandbox2  │
                    │                     │    │                    │
                    │  ┌─────────────┐    │    │  ┌─────────────┐   │
                    │  │ Netns Veth  │    │    │  │ Netns Veth  │   │
                    │  │10.100.1.2/16│    │    │  │10.100.1.4/16│   │
                    │  │   veth0     │    │    │  │   veth0     │   │
                    │  └─────────────┘    │    │  └─────────────┘   │
                    │          │          │    │          │         │
                    │          │          │    │          │         │
                    │  ┌─────────────┐    │    │  ┌─────────────┐   │
                    │  │ TAP Device  │    │    │  │ TAP Device  │   │
                    │  │10.200.0.1/24│    │    │  │10.200.0.1/24│   │
                    │  │    tap0     │    │    │  │    tap0     │   │
                    │  └─────────────┘    │    │  └─────────────┘   │
                    │          │          │    │          │         │
                    └──────────┼──────────┘    └──────────┼─────────┘
                               │                          │
                    ┌──────────▼──────────┐    ┌──────────▼─────────┐
                    │      GUEST 1        │    │      GUEST 2       │
                    │   Firecracker VM    │    │   Firecracker VM   │
                    │                     │    │                    │
                    │  ┌─────────────┐    │    │  ┌─────────────┐   │
                    │  │    eth0     │    │    │  │    eth0     │   │
                    │  │10.200.0.10/24    │    │  │10.200.0.10/24   │
                    │  │Gateway:     │    │    │  │Gateway:     │   │
                    │  │10.200.0.1   │    │    │  │10.200.0.1   │   │
                    │  └─────────────┘    │    │  └─────────────┘   │
                    └─────────────────────┘    └────────────────────┘## Network Flow

### Egress (Guest → Internet)
1. **Guest** sends packet to `10.200.0.1` (gateway)
2. **TAP device** in netns receives packet  
3. **iptables MASQUERADE** changes source to netns veth IP
4. **Netns veth** forwards to host veth via default route
5. **Host bridge** forwards to default interface  
6. **Host iptables** MASQUERADE to internet

### Ingress (Host → Guest)  
1. **Host** sends packet to netns veth IP (e.g., `10.100.1.2`)
2. **iptables DNAT** in netns changes destination to guest IP (`10.200.0.10`)
3. **TAP device** forwards to guest eth0
4. **Guest** receives packet
