import asyncio
import json
import base64
import urllib.request
import websockets

TARGET_URL = "http://localhost:8000"
ARTIFACT_DIR = "/Users/maheshbasarkod/.gemini/antigravity/brain/0e1ead3a-9ed6-4e22-87cd-b81791d4ccb4"

async def get_page_ws():
    req = urllib.request.urlopen("http://localhost:9222/json")
    tabs = json.loads(req.read().decode())
    for t in tabs:
        if t.get("type") == "page":
            return t["webSocketDebuggerUrl"]
    return None

async def call_cdp(ws, method, params=None, msg_id=[1]):
    mid = msg_id[0]
    msg_id[0] += 1
    req = {"id": mid, "method": method, "params": params or {}}
    await ws.send(json.dumps(req))
    while True:
        resp = await ws.recv()
        data = json.loads(resp)
        if data.get("id") == mid:
            return data.get("result", {})

async def main():
    ws_url = await get_page_ws()
    print("Connecting to Chrome CDP at:", ws_url)
    msg_id = [1]
    async with websockets.connect(ws_url, max_size=20*1024*1024) as ws:
        await call_cdp(ws, "Page.enable", {}, msg_id)
        await call_cdp(ws, "Runtime.enable", {}, msg_id)
        await call_cdp(ws, "Emulation.setDeviceMetricsOverride", {
            "width": 1440,
            "height": 900,
            "deviceScaleFactor": 1,
            "mobile": False
        }, msg_id)

        # 1. Login via Auth.login directly on login.html
        print("Navigating to login.html...")
        await call_cdp(ws, "Page.navigate", {"url": f"{TARGET_URL}/login.html"}, msg_id)
        await asyncio.sleep(2)

        print("Executing Auth.login for Admin...")
        login_res = await call_cdp(ws, "Runtime.evaluate", {
            "expression": """
                (async () => {
                    const res = await Auth.login('analytix63@gmail.com', 'Analytix@2026');
                    return res.user.role;
                })()
            """,
            "awaitPromise": True
        }, msg_id)
        print("Admin login result role:", login_res.get("result", {}).get("value"))
        await asyncio.sleep(2)

        # 2. Navigate to admin-dashboard.html
        print("Navigating to admin-dashboard.html...")
        await call_cdp(ws, "Page.navigate", {"url": f"{TARGET_URL}/admin-dashboard.html"}, msg_id)
        await asyncio.sleep(3)

        curr_url = await call_cdp(ws, "Runtime.evaluate", {"expression": "window.location.href"}, msg_id)
        print("Current URL:", curr_url.get("result", {}).get("value"))

        # Verify Events are rendered
        rows_count = await call_cdp(ws, "Runtime.evaluate", {
            "expression": "document.querySelectorAll('#kinobi-events-tbody tr').length"
        }, msg_id)
        print("Events rendered count:", rows_count.get("result", {}).get("value"))

        # Capture Featured Club Events view
        print("Capturing Featured Club Events view (Kinobi design)...")
        shot1 = await call_cdp(ws, "Page.captureScreenshot", {"format": "jpeg", "quality": 90}, msg_id)
        with open(f"{ARTIFACT_DIR}/kinobi_admin_events.jpg", "wb") as f:
            f.write(base64.b64decode(shot1["data"]))
        print("Saved kinobi_admin_events.jpg")

        # 3. Switch to Members List
        print("Switching to Club Members List...")
        await call_cdp(ws, "Runtime.evaluate", {"expression": "switchKinobiTab('members')"}, msg_id)
        await asyncio.sleep(2)
        shot2 = await call_cdp(ws, "Page.captureScreenshot", {"format": "jpeg", "quality": 90}, msg_id)
        with open(f"{ARTIFACT_DIR}/kinobi_admin_members.jpg", "wb") as f:
            f.write(base64.b64decode(shot2["data"]))
        print("Saved kinobi_admin_members.jpg")

        # 4. Switch to Hackathons
        print("Switching to Club Hackathons...")
        await call_cdp(ws, "Runtime.evaluate", {"expression": "switchKinobiTab('hackathons')"}, msg_id)
        await asyncio.sleep(2)
        shot3 = await call_cdp(ws, "Page.captureScreenshot", {"format": "jpeg", "quality": 90}, msg_id)
        with open(f"{ARTIFACT_DIR}/kinobi_admin_hackathons.jpg", "wb") as f:
            f.write(base64.b64decode(shot3["data"]))
        print("Saved kinobi_admin_hackathons.jpg")

        # 5. Switch to Applications
        print("Switching to Applications...")
        await call_cdp(ws, "Runtime.evaluate", {"expression": "switchKinobiTab('applications')"}, msg_id)
        await asyncio.sleep(2)
        shot4 = await call_cdp(ws, "Page.captureScreenshot", {"format": "jpeg", "quality": 90}, msg_id)
        with open(f"{ARTIFACT_DIR}/kinobi_admin_applications.jpg", "wb") as f:
            f.write(base64.b64decode(shot4["data"]))
        print("Saved kinobi_admin_applications.jpg")

        # 6. Test Member Access: Login as Priya Nair (Member)
        print("Testing Member login...")
        await call_cdp(ws, "Page.navigate", {"url": f"{TARGET_URL}/login.html"}, msg_id)
        await asyncio.sleep(2)

        m_login = await call_cdp(ws, "Runtime.evaluate", {
            "expression": """
                (async () => {
                    localStorage.clear();
                    const res = await Auth.login('priya@analytixclub.edu', 'analytix2026');
                    return res.user.role;
                })()
            """,
            "awaitPromise": True
        }, msg_id)
        print("Member login role:", m_login.get("result", {}).get("value"))
        await asyncio.sleep(2)

        # Go to member dashboard
        await call_cdp(ws, "Page.navigate", {"url": f"{TARGET_URL}/member-dashboard.html"}, msg_id)
        await asyncio.sleep(3)

        m_url = await call_cdp(ws, "Runtime.evaluate", {"expression": "window.location.href"}, msg_id)
        print("Member Dashboard URL:", m_url.get("result", {}).get("value"))

        shot_member = await call_cdp(ws, "Page.captureScreenshot", {"format": "jpeg", "quality": 90}, msg_id)
        with open(f"{ARTIFACT_DIR}/member_dashboard_view.jpg", "wb") as f:
            f.write(base64.b64decode(shot_member["data"]))
        print("Saved member_dashboard_view.jpg")

        # 7. Member tries to access admin-dashboard.html
        print("Attempting to access admin-dashboard.html as a Member...")
        await call_cdp(ws, "Page.navigate", {"url": f"{TARGET_URL}/admin-dashboard.html"}, msg_id)
        await asyncio.sleep(3)

        redirected_url = await call_cdp(ws, "Runtime.evaluate", {"expression": "window.location.href"}, msg_id)
        print("URL after unauthorized admin access attempt:", redirected_url.get("result", {}).get("value"))

        # Verify that the URL redirected back to member-dashboard.html
        assert "member-dashboard.html" in redirected_url.get("result", {}).get("value"), "RBAC violation: member was not redirected!"
        print("RBAC Verification SUCCESSFUL: Member was barred from admin portal and redirected to member dashboard!")

if __name__ == "__main__":
    asyncio.run(main())
