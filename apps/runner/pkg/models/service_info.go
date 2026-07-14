package models

type RunnerServiceInfo struct {
	ServiceName string
	Healthy     bool
	Err         error
}
