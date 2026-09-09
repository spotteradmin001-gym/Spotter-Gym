# Spotter Engine — desktop launcher GUI (CR-12).
#
# WinForms replacement for the old .hta (Windows Defender quarantines .hta on
# checkout). Same job: wraps engine/launcher/run-engine.mjs, shows Docker / WAHA
# / loop status and a live log.
#
#   Double-click  "Spotter Engine.cmd"   (which runs this with the right flags)
#   or:  powershell -NoProfile -ExecutionPolicy Bypass -STA -File Spotter-Engine.ps1

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$launcherDir = $PSScriptRoot
$repoDir     = Split-Path (Split-Path $launcherDir -Parent) -Parent  # engine\launcher -> engine -> repo
$logFile     = Join-Path $launcherDir 'engine.log'
$statusFile  = Join-Path $launcherDir 'status.json'
$daemon      = Join-Path $launcherDir 'run-engine.mjs'

function Start-Daemon([string[]]$daemonArgs) {
  Start-Process -FilePath 'node' `
    -ArgumentList (@("`"$daemon`"") + $daemonArgs) `
    -WorkingDirectory $repoDir -WindowStyle Hidden
}

function Read-Status {
  if (-not (Test-Path $statusFile)) { return $null }
  try { return Get-Content $statusFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $null }
}

function Stop-Daemon {
  $st = Read-Status
  if ($st -and $st.pid) {
    try { & taskkill /PID $st.pid /T /F 2>$null | Out-Null } catch {}
  }
  try {
    '{"running":false,"lastSummary":"stopped","pid":0}' | Set-Content $statusFile -Encoding UTF8
  } catch {}
}

# ---------------- form ----------------
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Spotter Engine'
$form.Size = New-Object System.Drawing.Size(660, 600)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(15, 23, 42)
$icoPath = Join-Path $launcherDir 'spotter-engine.ico'
if (Test-Path $icoPath) { try { $form.Icon = New-Object System.Drawing.Icon $icoPath } catch {} }

$header = New-Object System.Windows.Forms.Label
$header.Text = 'Spotter Engine'
$header.Font = New-Object System.Drawing.Font('Segoe UI', 13, [System.Drawing.FontStyle]::Bold)
$header.ForeColor = [System.Drawing.Color]::White
$header.BackColor = [System.Drawing.Color]::FromArgb(22, 163, 74)
$header.TextAlign = 'MiddleLeft'
$header.Padding = New-Object System.Windows.Forms.Padding(12, 0, 0, 0)
$header.Location = New-Object System.Drawing.Point(0, 0)
$header.Size = New-Object System.Drawing.Size(660, 46)
$form.Controls.Add($header)

function New-Light([string]$text, [int]$x) {
  $p = New-Object System.Windows.Forms.Panel
  $p.Location = New-Object System.Drawing.Point($x, 62)
  $p.Size = New-Object System.Drawing.Size(14, 14)
  $p.BackColor = [System.Drawing.Color]::FromArgb(100, 116, 139)
  $form.Controls.Add($p)
  $l = New-Object System.Windows.Forms.Label
  $l.Text = $text
  $l.ForeColor = [System.Drawing.Color]::FromArgb(226, 232, 240)
  $l.Font = New-Object System.Drawing.Font('Segoe UI', 9)
  $l.Location = New-Object System.Drawing.Point(($x + 20), 60)
  $l.Size = New-Object System.Drawing.Size(150, 18)
  $form.Controls.Add($l)
  return @{ Dot = $p; Label = $l }
}
$lDocker = New-Light 'Docker' 16
$lWaha   = New-Light 'WAHA' 130
$lLoop   = New-Light 'Loop' 240

$btnStart = New-Object System.Windows.Forms.Button
$btnStart.Text = 'Start loop'
$btnStart.Location = New-Object System.Drawing.Point(16, 92)
$btnStart.Size = New-Object System.Drawing.Size(96, 30)
$btnStart.BackColor = [System.Drawing.Color]::FromArgb(22, 163, 74)
$btnStart.ForeColor = [System.Drawing.Color]::White
$btnStart.FlatStyle = 'Flat'
$form.Controls.Add($btnStart)

$btnStop = New-Object System.Windows.Forms.Button
$btnStop.Text = 'Stop'
$btnStop.Location = New-Object System.Drawing.Point(120, 92)
$btnStop.Size = New-Object System.Drawing.Size(70, 30)
$btnStop.BackColor = [System.Drawing.Color]::FromArgb(185, 28, 28)
$btnStop.ForeColor = [System.Drawing.Color]::White
$btnStop.FlatStyle = 'Flat'
$form.Controls.Add($btnStop)

$btnOnce = New-Object System.Windows.Forms.Button
$btnOnce.Text = 'Run once now'
$btnOnce.Location = New-Object System.Drawing.Point(198, 92)
$btnOnce.Size = New-Object System.Drawing.Size(110, 30)
$btnOnce.BackColor = [System.Drawing.Color]::FromArgb(51, 65, 85)
$btnOnce.ForeColor = [System.Drawing.Color]::White
$btnOnce.FlatStyle = 'Flat'
$form.Controls.Add($btnOnce)

$lblEvery = New-Object System.Windows.Forms.Label
$lblEvery.Text = 'every'
$lblEvery.ForeColor = [System.Drawing.Color]::FromArgb(148, 163, 184)
$lblEvery.Location = New-Object System.Drawing.Point(320, 99)
$lblEvery.Size = New-Object System.Drawing.Size(40, 18)
$form.Controls.Add($lblEvery)

$cboEvery = New-Object System.Windows.Forms.ComboBox
$cboEvery.DropDownStyle = 'DropDownList'
$cboEvery.Location = New-Object System.Drawing.Point(360, 96)
$cboEvery.Size = New-Object System.Drawing.Size(90, 24)
[void]$cboEvery.Items.AddRange(@('5 min', '15 min', '30 min', '60 min'))
$cboEvery.SelectedIndex = 1
$form.Controls.Add($cboEvery)

$summary = New-Object System.Windows.Forms.Label
$summary.Text = 'Idle. Press "Start loop" to begin.'
$summary.ForeColor = [System.Drawing.Color]::FromArgb(148, 163, 184)
$summary.Location = New-Object System.Drawing.Point(16, 130)
$summary.Size = New-Object System.Drawing.Size(620, 18)
$form.Controls.Add($summary)

$log = New-Object System.Windows.Forms.TextBox
$log.Multiline = $true
$log.ReadOnly = $true
$log.ScrollBars = 'Vertical'
$log.WordWrap = $false
$log.BackColor = [System.Drawing.Color]::FromArgb(2, 6, 23)
$log.ForeColor = [System.Drawing.Color]::FromArgb(203, 213, 225)
$log.Font = New-Object System.Drawing.Font('Consolas', 8.5)
$log.Location = New-Object System.Drawing.Point(16, 154)
$log.Size = New-Object System.Drawing.Size(620, 390)
$form.Controls.Add($log)

# ---------------- behaviour ----------------
$everyMinutes = { @(5, 15, 30, 60)[$cboEvery.SelectedIndex] }

$btnStart.Add_Click({
  Start-Daemon @('--loop', '--every', "$(& $everyMinutes)")
  $summary.Text = 'Starting Docker + WAHA, then the first cycle...'
})
$btnOnce.Add_Click({
  Start-Daemon @('--once')
  $summary.Text = 'Running one cycle now...'
})
$btnStop.Add_Click({
  Stop-Daemon
  $summary.Text = 'Loop stopped.'
})

$green  = [System.Drawing.Color]::FromArgb(34, 197, 94)
$red    = [System.Drawing.Color]::FromArgb(239, 68, 68)
$amber  = [System.Drawing.Color]::FromArgb(245, 158, 11)
$grey   = [System.Drawing.Color]::FromArgb(100, 116, 139)

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.Add_Tick({
  $st = Read-Status
  $running = [bool]($st -and $st.running)

  $lDocker.Dot.BackColor = if ($st -and $st.dockerUp) { $green } elseif ($st) { $red } else { $grey }
  $lWaha.Dot.BackColor   = if ($st -and $st.wahaUp)   { $green } elseif ($st) { $red } else { $grey }

  if (-not $st) {
    $lLoop.Dot.BackColor = $grey; $lLoop.Label.Text = 'Loop'
  } elseif ($running -and $st.mode -eq 'loop') {
    $overdue = $false
    if ($st.nextCycleAt) {
      try { $overdue = ((Get-Date) - [datetime]$st.nextCycleAt).TotalMinutes -gt 5 } catch {}
    }
    $lLoop.Dot.BackColor = if ($overdue) { $amber } else { $green }
    $lLoop.Label.Text = if ($overdue) { 'Loop (stalled?)' } else { 'Loop (running)' }
  } elseif ($running) {
    $lLoop.Dot.BackColor = $green; $lLoop.Label.Text = 'Running once'
  } else {
    $lLoop.Dot.BackColor = $red; $lLoop.Label.Text = 'Loop (stopped)'
  }

  $btnStart.Enabled = -not $running
  $btnStop.Enabled  = $running
  $btnOnce.Enabled  = -not $running
  $cboEvery.Enabled = -not $running

  if ($st -and $st.lastSummary) {
    $extra = if ($st.lastCycleAt) { "   (last cycle $([string]$st.lastCycleAt -replace 'T',' ' -replace '\..*$',''))" } else { '' }
    $summary.Text = "$($st.lastSummary)$extra"
  }

  if (Test-Path $logFile) {
    try {
      $lines = Get-Content $logFile -Tail 200 -Encoding UTF8
      $text = ($lines -join "`r`n")
      if ($log.Text -ne $text) {
        $log.Text = $text
        $log.SelectionStart = $log.Text.Length
        $log.ScrollToCaret()
      }
    } catch {}
  }
})

$form.Add_Shown({ $timer.Start() })
$form.Add_FormClosed({ $timer.Stop() })
[void]$form.ShowDialog()
