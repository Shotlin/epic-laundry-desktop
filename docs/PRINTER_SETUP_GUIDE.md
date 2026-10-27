# Connecting the TSC TTP-244 Pro / TE244 label printer to the LNDRY POS website

This guide is for the shop PC (Windows) that has the TSC printer plugged in with the TSC driver already installed.
The website is **https://pos.lndry.in**.

> Status when this was written (27 Oct 2026): the code is committed locally (`ef375aa`). It goes live only after
> `git push origin main` succeeds and Vercel finishes building. The Windows helper program (Print Agent) has been
> tested only against a simulated copy, not yet on a real Windows PC.

---

## Why a helper program is needed

- A website cannot talk to a printer by itself.
- Windows lets only **one driver** own a USB printer. With the TSC driver installed, Chrome is not allowed to open
  the printer. You then see: *"Another program or the Windows printer driver is holding the printer."*
- The **LNDRY Print Agent** is a small program on the shop PC. The website gives it the label, and it passes the label
  to the printer **through the TSC driver you already have**. Nothing is removed.
- It listens only on that PC and accepts requests only from pos.lndry.in.

---

## One-time setup (about 5 minutes)

### Step 1 — Before you start
- Use **Google Chrome** (or Microsoft Edge) on the shop PC.
- Printer plugged in with the USB cable, **switched on**, labels loaded (and ribbon, if you use ribbon labels).
- In Windows, **Settings → Bluetooth & devices → Printers & scanners** must list the TSC printer.
  If it does not, install the TSC driver first.

### Step 2 — Download the installer
1. Open **https://pos.lndry.in** and sign in.
2. Go to **Print centre**, or **Settings → Tags & printers**.
3. Open the **Label printer** box. Under **Print through the Windows driver (LNDRY Print Agent)** press
   **Download installer**.
   (Direct link: `https://pos.lndry.in/print-agent/Install-LndryPrintAgent.cmd`)
4. If Chrome says the file may be harmful or is not commonly downloaded, choose **Keep**.

### Step 3 — Run the installer
1. Open the downloaded file **Install-LndryPrintAgent.cmd** (double-click).
2. If Windows says *"Windows protected your PC"*: click **More info → Run anyway**.
3. A black window opens. When it works it shows:
   - `LNDRY Print Agent 1.0.0 is running on this computer.`
   - a list of printers, with your TSC printer marked `<-- label printer`.
4. Press any key to close the window. The agent keeps running in the background and starts by itself
   every time you sign in to Windows.

### Step 4 — Connect from the website
1. Back on the website, in the **Label printer** box, press **Detect agent**.
2. Chrome asks to let the site *access other apps and services on this device* — click **Allow**.
   (If you clicked Block by mistake: click the lock icon next to the address → **Site settings** →
   set **Local network access** / *Apps on device* to **Allow**, then press **Detect agent** again.)
3. The badge shows **Agent running**. If the TSC printer is the only label printer it is chosen automatically.
   Otherwise pick it from **Windows printer to use for labels**.
4. The top badge turns green: **Connected**. You will see the printer model, serial number (when Windows reports
   one) and *Windows driver · print agent*.

### Step 5 — Set up the label size and test
1. In **Print centre**, choose your label size (for example **Mini tag · 60 × 40 mm**).
   Keep **Printer resolution** at **203 dpi** (the TTP-244 Pro and TE244 are 203 dpi).
2. In the Label printer box press **Calibrate label sensor** once. The printer feeds a few labels.
   Wait until it stops. Do this again whenever you change the label roll or size.
3. Under **Label & print settings for this printer** check:
   - **Label stock**: *Die-cut labels (gap)*, gap about **3 mm** (use the real gap of your roll).
   - **Ribbon / print method**: pick *Thermal transfer (ribbon)* if you use a ribbon, *Direct thermal* if not.
     If unsure leave *Keep the printer's own setting*.
4. Press **Print test label**. You should get a framed label with a solid black square, a second solid square and a barcode.

### Step 6 — Check the test label
| What you see | What to do |
| --- | --- |
| Both squares black, text and barcode clear | Done — go to Step 7. |
| First square black, **second square white** | Tick **Flip image polarity** and print the test again. |
| Everything is upside-down | Tick **Turn labels upside-down (180°)** and print again. |
| Blank label | Check ribbon / print method (Step 5.3) and the darkness (try 10). |
| Label is shifted or skips labels | Press **Calibrate label sensor** again and check the gap (mm). |

### Step 7 — Print real tags
- Make sure **How tags are printed on this computer** is set to **Straight to the label printer**.
- Open an order in **Print centre** and press **Print all** (or after booking, if auto-print is on).
  All tags print one after another with no dialog.
- After printing, the notice says how many labels were sent and what Windows reports about the printer.

---

## What happens every day afterwards
- Turn on the PC and the printer, open the website. It **reconnects by itself** — no login change, no new setup.
- It also reconnects after a reload or after signing in with a different account.
- If the printer is switched off the badge says **Not connected**; switch it on and it reconnects within about 30 seconds,
  or press **Reconnect**.
- If the printer is not connected when you print, the website falls back to the normal browser print dialog and tells you why.

---

## If something goes wrong

**"Agent not detected"**
- Run **Install-LndryPrintAgent.cmd** again (it replaces the old copy and restarts it).
- Open `http://localhost:9271/status` in Chrome on that PC. You should see `{"ok":true,"agent":"lndry-print-agent",...}`.
  If the page does not load, the agent is not running.
- Check Chrome's *Local network access* permission for pos.lndry.in (Step 4.2).
- Read the log: press `Win + R`, type `%LOCALAPPDATA%\LndryPrintAgent\agent.log`, Enter.

**Agent is running but the printer does not print**
- In Windows open the printer's queue (Settings → Printers → TSC → Open print queue) and make sure it is not
  **paused** or **offline** and has no stuck jobs.
- Make sure the Windows printer chosen in the website is the TSC printer, not a PDF printer.
- Press **Printer self-test** — the printer should print its own settings page.
- Check paper/ribbon, the lid is closed, and run **Calibrate label sensor**.

**The label is blank**
- Wrong print method (ribbon vs direct thermal) is the most common cause. See Step 5.3.
- Raise **Darkness** a few steps.

**Only one label prints and it stops / labels skip**
- Calibrate the sensor and set the correct gap (mm). Clean the gap sensor with a cotton swab and 99 % alcohol if needed.

**Remove the agent**
- Open Command Prompt, go to the folder where you saved the installer and run:
  `Install-LndryPrintAgent.cmd uninstall`

---

## Other ways to connect (only if you cannot use the agent)

1. **Direct USB (WinUSB driver)** — for a PC that does **not** need the TSC driver. Use the free *Zadig* tool
   (zadig.akeo.ie → Options → List all devices → TSC printer → WinUSB → Replace Driver), then press
   **Connect directly over USB** under *Advanced*. After this the TSC Windows driver no longer works for that printer.
   On Mac, Linux and Chromebook no driver change is needed.
2. **Browser print dialog** — choose **Browser print dialog** in *How tags are printed*. In the TSC driver create the label
   size (Printing Preferences → Stocks → User defined: width, height, gap), then in the browser dialog choose
   *Actual size / 100 %* and no headers/footers. For no dialog at all, start Chrome with `--kiosk-printing` and make the TSC
   printer the Windows default.

---

## For the developer
- Agent source: `webapp/print-agent/lndry-print-agent.ps1` (plain ASCII, Windows PowerShell 5.1, no admin rights).
- `webapp/scripts/build-print-agent.mjs` builds the one-file installer into `webapp/public/print-agent/`; `npm run build:web` runs it.
- Browser client: `webapp/src/lib/printAgent.ts` (agent), `webapp/src/lib/labelPrinter.ts` (connection manager),
  `webapp/src/lib/tspl.ts` (label → TSPL), `webapp/src/components/laundry/LabelPrinterPanel.tsx` (panel).
- Agent port: `9271`. Allowed origins: `https://pos.lndry.in`, `http://localhost:5199`. Extra origins can be passed
  to the agent with `-ExtraOrigin`.
- Not yet verified on real hardware: BITMAP bit polarity, label direction, and the Windows run of the agent itself.
