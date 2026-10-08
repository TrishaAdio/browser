# IP Browser

A Windows desktop browser. When it starts, it asks you for an IPv4 configuration, then sends all your browsing through that IP.

## Use it
1. Run **`IP Browser 1.0.0.exe`**. It's portable, so there's nothing to install.
2. Pick one:
   - **Use Proxy IP**: choose HTTP, SOCKS5 or SOCKS4, then enter the IPv4 address and port. You can paste `1.2.3.4:8080` straight into the first box. Username and password are optional.
   - **Direct**: use your normal connection.
3. Click **Test Connection** to see the IP that websites will see. Then click **Start Browsing**.
4. To change the IP later, click the green **IP badge** at the top right. Open tabs reload using the new IP.

## Shortcuts
`Ctrl+T` new tab · `Ctrl+W` close tab · `Ctrl+L` address bar · `Ctrl+R`/`F5` reload · `Alt+←/→` back/forward · `Ctrl+Tab` next tab · middle-click a tab to close it

## Build from source
```bash
npm install
npm start               # run in development
npm run dist            # build dist/IP Browser 1.0.0.exe (portable)
npm run dist:installer  # build a Setup.exe installer (run this on Windows)
```

## Notes
- Chromium can't do SOCKS proxy authentication, so username/password only works with **HTTP** proxies.
- If "Remember" is checked, your settings are saved in `%APPDATA%\ip-browser\ip-config.json`. The password is encrypted with Windows DPAPI.
- The current IP is looked up through `api.ipify.org`.
