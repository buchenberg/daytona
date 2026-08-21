package netrules

// AssignNetworkRules assigns network rules to a container by inserting a rule in
// the DOCKER-USER chain. It anchors on the host veth when available and falls
// back to source IP otherwise (see buildAnchor).
func (manager *NetRulesManager) AssignNetworkRules(name string, sourceIp string, vethName string) error {
	// Add prefix to chain name
	chainName := formatChainName(name)

	manager.mu.Lock()
	defer manager.mu.Unlock()

	// check does the chain exist
	exists, err := manager.ipt.ChainExists("filter", chainName)
	if err != nil {
		return err
	}

	// return if the chain does not exist
	if !exists {
		return nil
	}

	rulespec := append(buildAnchor(sourceIp, vethName), "-j", chainName)
	return manager.ipt.InsertUnique("filter", "DOCKER-USER", 1, rulespec...)
}
