//go:build linux || darwin

package computeruse

import (
	"github.com/robotn/xgb/xproto"
	"github.com/robotn/xgbutil/xprop"
)

func x11ClientListFromProperty(reply *xproto.GetPropertyReply, err error) ([]xproto.Window, error) {
	if err != nil {
		return nil, err
	}
	if reply.Format == 0 {
		return []xproto.Window{}, nil
	}

	return xprop.PropValWindows(reply, nil)
}
