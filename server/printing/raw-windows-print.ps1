param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$BinaryPath
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $BinaryPath)) {
  throw "No existe el archivo temporal de impresion"
}
$bytes = [System.IO.File]::ReadAllBytes($BinaryPath)
if ($bytes.Length -lt 1) { throw "Buffer vacio" }

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class RawWinSpool {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO1 {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int Level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO1 di);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
  public static void SendRaw(string printer, byte[] data) {
    IntPtr h = IntPtr.Zero;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) {
      throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "OpenPrinter");
    }
    try {
      var di = new DOCINFO1();
      di.pDocName = "Resto-FADEY";
      di.pOutputFile = null;
      di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) {
        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "StartDocPrinter");
      }
      try {
        if (!StartPagePrinter(h)) {
          throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "StartPagePrinter");
        }
        try {
          IntPtr p = Marshal.AllocCoTaskMem(data.Length);
          try {
            Marshal.Copy(data, 0, p, data.Length);
            int written;
            if (!WritePrinter(h, p, data.Length, out written) || written != data.Length) {
              throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "WritePrinter");
            }
          } finally {
            Marshal.FreeCoTaskMem(p);
          }
        } finally {
          EndPagePrinter(h);
        }
      } finally {
        EndDocPrinter(h);
      }
    } finally {
      ClosePrinter(h);
    }
  }
}
"@

[RawWinSpool]::SendRaw($PrinterName, $bytes)
