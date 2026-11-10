param([string]$DocxPath, [string]$PdfPath)

$word = $null
$doc = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $doc = $word.Documents.Open($DocxPath)
    $doc.ExportAsFixedFormat($PdfPath, 17)
    Write-Host "SUCCESS: Exported to $PdfPath"
} catch {
    Write-Error $_.Exception.Message
} finally {
    if ($doc) { try { $doc.Close(0) } catch {} }
    if ($word) { try { $word.Quit() } catch {} }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
