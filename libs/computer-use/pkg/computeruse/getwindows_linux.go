//go:build linux

package computeruse

import (
	"github.com/daytonaio/daemon/pkg/toolbox/computeruse"
	"github.com/robotn/xgb/xproto"
	"github.com/robotn/xgbutil"
	"github.com/robotn/xgbutil/ewmh"
	"github.com/robotn/xgbutil/icccm"
	"github.com/robotn/xgbutil/xprop"
)

func getWindows() ([]computeruse.WindowInfo, error) {
	return getWindowsX11()
}

func getX11ClientList(xu *xgbutil.XUtil) ([]xproto.Window, error) {
	atom, err := xprop.Atm(xu, "_NET_CLIENT_LIST")
	if err != nil {
		return nil, err
	}

	reply, err := xproto.GetProperty(
		xu.Conn(), false, xu.RootWin(), atom, xproto.GetPropertyTypeAny, 0, (1<<32)-1,
	).Reply()

	return x11ClientListFromProperty(reply, err)
}

func getWindowsX11() ([]computeruse.WindowInfo, error) {
	xu, err := xgbutil.NewConn()
	if err != nil {
		return nil, err
	}
	defer xu.Conn().Close()

	clientList, err := getX11ClientList(xu)
	if err != nil {
		return nil, err
	}

	windows := make([]computeruse.WindowInfo, 0, len(clientList))
	seen := make(map[uint]bool)
	for _, win := range clientList {
		pid, err := ewmh.WmPidGet(xu, win)
		if err != nil || seen[pid] {
			continue
		}

		title, err := ewmh.WmVisibleNameGet(xu, win)
		if err != nil || title == "" {
			title, _ = ewmh.WmNameGet(xu, win)
		}
		if title == "" {
			title, _ = icccm.WmNameGet(xu, win)
		}
		if title == "" {
			continue
		}

		seen[pid] = true
		windows = append(windows, computeruse.WindowInfo{
			ID:    int(pid),
			Title: title,
			Position: computeruse.Position{
				X: 0, // Would need platform-specific implementation.
				Y: 0, // Would need platform-specific implementation.
			},
			Size: computeruse.Size{
				Width:  0, // Would need platform-specific implementation.
				Height: 0, // Would need platform-specific implementation.
			},
			IsActive: false, // Would need platform-specific implementation.
		})
	}

	return windows, nil
}
