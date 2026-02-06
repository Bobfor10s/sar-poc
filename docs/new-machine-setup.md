# SAR POC – New Computer Install & Migration Guide

This guide explains how to continue development on your current computer and safely migrate the SAR POC project to a new Windows computer.

## Source of truth
- **Git repository** (your project folder, including `.git`)
- **Supabase database** (hosted; tables already exist)
- **.env.local** (Supabase keys; never commit to Git)

## While you keep working on the current computer
- Commit changes frequently:
  - `git add .`
  - `git commit -m "message"`
- Keep the project running locally with `npm run dev`

## Migration over local network (recommended)
### Share from old computer
1. Right-click the `sar-poc` folder → **Properties** → **Sharing** → **Advanced Sharing**
2. Enable sharing and grant read/write permissions to your user (or temporarily Everyone)
3. Note the path like `\\OLD-PC\sar-poc`

### Copy to new computer
1. Open File Explorer and enter `\\OLD-PC\sar-poc`
2. Copy the folder to a **local** path (example: `C:\Users\<you>\sar-poc`)
3. Do **not** run the project from the network share

## Restore and verify
1. Delete build artifacts (recommended):
   - `node_modules`
   - `.next`
2. Install dependencies:
   - `npm install`
3. Copy/recreate `.env.local`
4. Run locally:
   - `npm run dev`
5. Verify:
   - navigation loads
   - Members list works
   - Calls list + call detail attendance works
   - Courses + Certifications pages load

## Automation script
Use the helper script (place in project root):

```powershell
powershell -ExecutionPolicy Bypass -File .\sar-poc_setup-new-machine.ps1
```

## PDFs
- Full guide: `SAR_POC_New_Computer_Install_Guide.pdf`
- Quick checklist: `SAR_POC_New_Computer_Quick_Checklist.pdf`
