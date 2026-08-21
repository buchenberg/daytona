package session

import (
	"github.com/daytonaio/daemon/pkg/common"
)

func (s *SessionService) Get(sessionId string) (*Session, error) {
	_, ok := s.sessions.Get(sessionId)
	if !ok {
		return nil, common.NewProcessNotFoundError("session not found")
	}

	commands, err := s.getSessionCommands(sessionId)
	if err != nil {
		return nil, err
	}

	return &Session{
		SessionId: sessionId,
		Commands:  commands,
	}, nil
}
