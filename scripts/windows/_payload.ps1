$ErrorActionPreference = "Stop"
$FormName = "Sri Wedding Tag"
$WidthMm  = 54
$HeightMm = 65

function Line { param($t, $c = "Gray") Write-Host $t -ForegroundColor $c }

Write-Host ""
Line "===============================================" "Cyan"
Line "  Sri Wedding Tag - printer paper size setup" "Cyan"
Line "===============================================" "Cyan"
Write-Host ""

# --- must be elevated -------------------------------------------------------
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$pr = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Line "  X  This did not start with Administrator rights." "Red"
    Line "     Close this window, right-click the file and choose" "Yellow"
    Line "     'Run as administrator', then try again." "Yellow"
    exit 1
}

# --- spooler API ------------------------------------------------------------
# There is no PowerShell cmdlet for print forms, so call the spooler directly.
try {
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class PF
{
    [StructLayout(LayoutKind.Sequential)]
    public struct SIZEL { public int cx; public int cy; }
    [StructLayout(LayoutKind.Sequential)]
    public struct RECTL { public int left; public int top; public int right; public int bottom; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct FORM_INFO_1 {
        public uint Flags;
        [MarshalAs(UnmanagedType.LPWStr)] public string pName;
        public SIZEL Size;
        public RECTL ImageableArea;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct PRINTER_DEFAULTS {
        public IntPtr pDatatype; public IntPtr pDevMode; public uint DesiredAccess;
    }
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool OpenPrinter(string p, out IntPtr h, ref PRINTER_DEFAULTS d);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr h);
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool AddForm(IntPtr h, uint lvl, ref FORM_INFO_1 f);
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool DeleteForm(IntPtr h, string name);
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool GetForm(IntPtr h, string name, uint lvl, IntPtr pForm, uint cb, out uint need);
}
"@
} catch {
    Line "  X  This computer could not load the printer setup code." "Red"
    Line "     $($_.Exception.Message)" "Yellow"
    exit 1
}

$w = [int]($WidthMm  * 1000)   # spooler units are thousandths of a millimetre
$h = [int]($HeightMm * 1000)

$defs = New-Object PF+PRINTER_DEFAULTS
$defs.pDatatype = [IntPtr]::Zero
$defs.pDevMode  = [IntPtr]::Zero
$defs.DesiredAccess = 1        # SERVER_ACCESS_ADMINISTER

$hs = [IntPtr]::Zero
if (-not [PF]::OpenPrinter($null, [ref]$hs, [ref]$defs)) {
    $e = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    Line "  X  Could not open the print system (error $e)." "Red"
    Line "     Make sure the 'Print Spooler' service is running." "Yellow"
    exit 1
}

try {
    Line "  Adding paper size '$FormName' ($WidthMm x $HeightMm mm)..." "Gray"

    # Delete first so re-running always ends in a known-good state.
    [void][PF]::DeleteForm($hs, $FormName)

    $f = New-Object PF+FORM_INFO_1
    $f.Flags = 0
    $f.pName = $FormName
    $sz = New-Object PF+SIZEL; $sz.cx = $w; $sz.cy = $h
    $f.Size = $sz
    $ia = New-Object PF+RECTL
    $ia.left = 0; $ia.top = 0; $ia.right = $w; $ia.bottom = $h
    $f.ImageableArea = $ia

    if (-not [PF]::AddForm($hs, 1, [ref]$f)) {
        $e = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        Line "  X  Could not create the paper size (error $e)." "Red"
        exit 1
    }

    # Ask for the form with a zero-length buffer: if it exists the spooler
    # reports the size it would need, which is the cheapest proof it is really
    # registered rather than just trusting AddForm's return value.
    $need = 0
    [void][PF]::GetForm($hs, $FormName, 1, [IntPtr]::Zero, 0, [ref]$need)
    if ($need -gt 0) {
        Line "  OK  Paper size created and verified." "Green"
    } else {
        Line "  X  Created, but it could not be read back." "Red"
        exit 1
    }
}
finally { [void][PF]::ClosePrinter($hs) }

# --- best effort: make it the default paper on the label printer ------------
Write-Host ""
$cands = @()
try {
    $cands = @(Get-Printer -ErrorAction SilentlyContinue |
               Where-Object { $_.Name -match 'LP\s*46|SNBC|TVSE|TVS ' })
} catch {
    # Older Windows without the PrintManagement module - harmless, the paper
    # size is already installed and selectable by hand.
}

if ($cands.Count -ge 1) {
    $p = $cands[0].Name
    Line "  Label printer found: $p" "Gray"
    try {
        Set-PrintConfiguration -PrinterName $p -PaperSize $FormName -ErrorAction Stop
        Line "  OK  Set as the default paper for that printer." "Green"
    } catch {
        Line "  !   Could not set it automatically - not a problem." "Yellow"
        Line "      Just pick '$FormName' in the print window." "Yellow"
    }
} else {
    Line "  !   No label printer detected - not a problem." "Yellow"
    Line "      The paper size is installed for all printers." "Yellow"
}

Write-Host ""
Line "===============================================" "Green"
Line "  DONE - setup finished successfully" "Green"
Line "===============================================" "Green"
Write-Host ""
Line "  Next: open the website, click Print Tag, and in" "Cyan"
Line "  the print window set:" "Cyan"
Line "     Paper size  =  $FormName" "White"
Line "     Margins     =  None" "White"
Write-Host ""
exit 0
