<#
.SYNOPSIS
    Creates the "Sri Wedding Tag" 54 x 65 mm paper size on a Windows machine.

.DESCRIPTION
    The tag printout is laid out for a 54 x 65 mm label (the white window of the
    pre-printed Sri Wedding card). Chrome can only honour that if a paper size of
    exactly those dimensions exists in the Windows print spooler, so every shop
    machine needs this form registered once.

    This registers it as a print-server form, which is what the Print dialog's
    "Paper size" list reads from. Run it once per machine, as Administrator.

.PARAMETER PrinterName
    Optional. If given, the script also sets this printer's default paper to the
    new form. Match the name exactly as it appears in Windows Settings, e.g.
    "SNBC TVSE LP 46 NEO BPLE".

.PARAMETER WidthMm / HeightMm
    Defaults 54 x 65. Override only if the card stock changes.

.PARAMETER Remove
    Deletes the form instead of creating it.

.EXAMPLE
    # Right-click PowerShell -> Run as Administrator, then:
    .\Install-SriWeddingTag.ps1

.EXAMPLE
    .\Install-SriWeddingTag.ps1 -PrinterName "SNBC TVSE LP 46 NEO BPLE"

.NOTES
    Must run elevated: adding a server form needs SERVER_ACCESS_ADMINISTER.
#>
[CmdletBinding()]
param(
    [string] $FormName   = "Sri Wedding Tag",
    [double] $WidthMm    = 54,
    [double] $HeightMm   = 65,
    [string] $PrinterName,
    [switch] $Remove
)

$ErrorActionPreference = "Stop"

# --- must be elevated -------------------------------------------------------
$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be run as Administrator (right-click PowerShell -> Run as Administrator)."
    exit 1
}

# --- spooler API ------------------------------------------------------------
# There is no PowerShell cmdlet for print forms, so call the spooler directly.
if (-not ("PrintForms" -as [type])) {
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class PrintForms
{
    [StructLayout(LayoutKind.Sequential)]
    public struct SIZEL { public int cx; public int cy; }

    [StructLayout(LayoutKind.Sequential)]
    public struct RECTL { public int left; public int top; public int right; public int bottom; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct FORM_INFO_1
    {
        public uint Flags;
        [MarshalAs(UnmanagedType.LPWStr)] public string pName;
        public SIZEL Size;
        public RECTL ImageableArea;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PRINTER_DEFAULTS
    {
        public IntPtr pDatatype;
        public IntPtr pDevMode;
        public uint   DesiredAccess;
    }

    public const uint SERVER_ACCESS_ADMINISTER = 0x00000001;

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, ref PRINTER_DEFAULTS pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool AddForm(IntPtr hPrinter, uint Level, ref FORM_INFO_1 pForm);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool DeleteForm(IntPtr hPrinter, string pFormName);
}
"@
}

# Spooler measures forms in thousandths of a millimetre.
$width  = [int][Math]::Round($WidthMm  * 1000)
$height = [int][Math]::Round($HeightMm * 1000)

$defaults = New-Object PrintForms+PRINTER_DEFAULTS
$defaults.pDatatype     = [IntPtr]::Zero
$defaults.pDevMode      = [IntPtr]::Zero
$defaults.DesiredAccess = [PrintForms]::SERVER_ACCESS_ADMINISTER

$handle = [IntPtr]::Zero
# $null as the printer name opens the local print server itself.
if (-not [PrintForms]::OpenPrinter($null, [ref]$handle, [ref]$defaults)) {
    $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    Write-Error "Could not open the local print server (Win32 error $code). Is the Print Spooler service running?"
    exit 1
}

try {
    if ($Remove) {
        if ([PrintForms]::DeleteForm($handle, $FormName)) {
            Write-Host "Removed form '$FormName'." -ForegroundColor Yellow
        } else {
            $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            if ($code -eq 1902) { Write-Host "Form '$FormName' did not exist; nothing to remove." }
            else { Write-Error "Could not remove form (Win32 error $code)." ; exit 1 }
        }
        exit 0
    }

    $form = New-Object PrintForms+FORM_INFO_1
    $form.Flags = 0                       # FORM_USER
    $form.pName = $FormName

    $size = New-Object PrintForms+SIZEL
    $size.cx = $width
    $size.cy = $height
    $form.Size = $size

    # Full bleed: the layout already reserves its own margins in CSS, and the
    # card's printable window is the whole sheet as far as the printer knows.
    $area = New-Object PrintForms+RECTL
    $area.left   = 0
    $area.top    = 0
    $area.right  = $width
    $area.bottom = $height
    $form.ImageableArea = $area

    if (-not [PrintForms]::AddForm($handle, 1, [ref]$form)) {
        $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        if ($code -eq 1901) {
            # ERROR_INVALID_FORM_NAME can also mean "already exists" here; replace it
            # so re-running the script is safe.
            Write-Host "Form '$FormName' already exists - replacing it."
            [void][PrintForms]::DeleteForm($handle, $FormName)
            if (-not [PrintForms]::AddForm($handle, 1, [ref]$form)) {
                $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
                Write-Error "Could not create form (Win32 error $code)."
                exit 1
            }
        }
        elseif ($code -eq 1900) {
            Write-Host "Form '$FormName' already exists with these dimensions - nothing to do." -ForegroundColor Green
        }
        else {
            Write-Error "Could not create form (Win32 error $code)."
            exit 1
        }
    }

    Write-Host "Created form '$FormName' - $WidthMm x $HeightMm mm." -ForegroundColor Green
}
finally {
    [void][PrintForms]::ClosePrinter($handle)
}

# --- verify -----------------------------------------------------------------
Write-Host ""
Write-Host "Verify in:  Control Panel -> Devices and Printers -> (select any printer)" -ForegroundColor Cyan
Write-Host "            -> Print server properties -> Forms tab -> '$FormName'" -ForegroundColor Cyan

# --- optionally make it the printer default ---------------------------------
# The form above is server-wide and works no matter what the printer is called.
# This step is only about setting that printer's *default* paper, so when no
# name is given we try to find the label printer ourselves — the name differs
# between shop machines depending on how the driver was installed.
if (-not $PrinterName) {
    $candidates = @(Get-Printer -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match 'LP\s*46|SNBC|TVSE|TVS ' })

    if ($candidates.Count -eq 1) {
        $PrinterName = $candidates[0].Name
        Write-Host "Detected label printer: '$PrinterName'." -ForegroundColor Cyan
    }
    elseif ($candidates.Count -gt 1) {
        Write-Host ""
        Write-Host "Several printers look like the label printer. Re-run with the one you want:" -ForegroundColor Yellow
        $candidates | ForEach-Object { Write-Host "    .\Install-SriWeddingTag.ps1 -PrinterName `"$($_.Name)`"" }
    }
    else {
        Write-Host ""
        Write-Host "No label printer detected. The form is installed either way - just pick" -ForegroundColor Yellow
        Write-Host "'$FormName' in the print dialog. Installed printers:" -ForegroundColor Yellow
        Get-Printer -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "    $($_.Name)" }
    }
}

if ($PrinterName) {
    if (-not (Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue)) {
        Write-Warning "Printer '$PrinterName' not found. Installed printers:"
        Get-Printer -ErrorAction SilentlyContinue | ForEach-Object { Write-Warning "    $($_.Name)" }
    }
    else {
        try {
            Set-PrintConfiguration -PrinterName $PrinterName -PaperSize $FormName -ErrorAction Stop
            Write-Host "Set '$PrinterName' default paper to '$FormName'." -ForegroundColor Green
        }
        catch {
            Write-Warning "Could not set the default paper automatically: $($_.Exception.Message)"
            Write-Warning "Set it by hand: Printing Preferences -> Paper size -> $FormName"
        }
    }
}

Write-Host ""
Write-Host "In Chrome's print dialog choose Paper size = '$FormName' and Margins = None." -ForegroundColor Cyan
