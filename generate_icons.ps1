Add-Type -AssemblyName System.Drawing

function Generate-AppIcon($size, $outputPath) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 11, 15, 25))
    $g.FillRectangle($bgBrush, 0, 0, $size, $size)

    $penGold = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 245, 158, 11), [int]($size * 0.03))
    $g.DrawRectangle($penGold, [int]($size*0.03), [int]($size*0.03), [int]($size*0.94), [int]($size*0.94))

    $brushGreen = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 34, 197, 94))
    $brushRed = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 239, 68, 68))
    $brushGold = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 245, 158, 11))

    $g.FillRectangle($brushRed, [int]($size*0.18), [int]($size*0.48), [int]($size*0.1), [int]($size*0.28))
    $g.FillRectangle($brushGreen, [int]($size*0.35), [int]($size*0.38), [int]($size*0.1), [int]($size*0.38))
    $g.FillRectangle($brushGold, [int]($size*0.52), [int]($size*0.28), [int]($size*0.1), [int]($size*0.48))
    $g.FillRectangle($brushGreen, [int]($size*0.69), [int]($size*0.18), [int]($size*0.1), [int]($size*0.58))

    $penLine = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 245, 158, 11), [int]($size * 0.05))
    $p1 = New-Object System.Drawing.Point([int]($size*0.15), [int]($size*0.65))
    $p2 = New-Object System.Drawing.Point([int]($size*0.4), [int]($size*0.48))
    $p3 = New-Object System.Drawing.Point([int]($size*0.55), [int]($size*0.38))
    $p4 = New-Object System.Drawing.Point([int]($size*0.8), [int]($size*0.15))
    $g.DrawLines($penLine, @($p1, $p2, $p3, $p4))

    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

New-Item -ItemType Directory -Path "D:\Stocks_scanner_firebase\public\icons" -Force
Generate-AppIcon 192 "D:\Stocks_scanner_firebase\public\icons\icon-192.png"
Generate-AppIcon 512 "D:\Stocks_scanner_firebase\public\icons\icon-512.png"
Write-Host "Icons generated successfully!"
