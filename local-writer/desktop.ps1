param([string]$NodePath = 'node', [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$script:worker = $null
$script:mode = ''
$script:closing = $false
$root = Split-Path $PSScriptRoot -Parent
$entry = Join-Path $PSScriptRoot 'main.mjs'
if ($CheckOnly) { Write-Output 'Desktop launcher parsed successfully'; exit 0 }

$form = New-Object System.Windows.Forms.Form
$form.Text = '블로그 임시저장 도우미'
$form.ClientSize = New-Object System.Drawing.Size(630, 460)
$form.StartPosition = 'CenterScreen'
$form.Font = New-Object System.Drawing.Font('Malgun Gothic', 10)
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false

$help = New-Object System.Windows.Forms.Label
$help.Location = New-Object System.Drawing.Point(20, 18)
$help.Size = New-Object System.Drawing.Size(590, 80)
$help.Text = "처음 연결: 대시보드에서 PC 연결 코드를 만든 뒤 아래에 붙여넣으세요.`r`n연결 후: 네이버 로그인 → 로그인 완료 → 실행 시작 순서입니다.`r`n이미 연결·로그인했다면 실행 시작만 누르세요. 실제 발행은 하지 않습니다."
$form.Controls.Add($help)
$code = New-Object System.Windows.Forms.TextBox
$code.Location = New-Object System.Drawing.Point(20, 105)
$code.Size = New-Object System.Drawing.Size(455, 30)
$code.MaxLength = 64
$code.UseSystemPasswordChar = $true
$form.Controls.Add($code)

function New-WriterButton($text, $x, $y, $width) {
  $button = New-Object System.Windows.Forms.Button
  $button.Text = $text
  $button.Location = New-Object System.Drawing.Point($x, $y)
  $button.Size = New-Object System.Drawing.Size($width, 38)
  $form.Controls.Add($button)
  return $button
}
$pair = New-WriterButton 'PC 연결' 485 100 125
$login = New-WriterButton '네이버 로그인' 20 155 135
$confirmed = New-WriterButton '로그인 완료' 165 155 135
$start = New-WriterButton '실행 시작' 310 155 135
$stop = New-WriterButton '실행 중지' 455 155 155
$dashboard = New-WriterButton '대시보드 열기' 20 205 180
$confirmed.Enabled = $false
$stop.Enabled = $false
$status = New-Object System.Windows.Forms.TextBox
$status.Location = New-Object System.Drawing.Point(20, 260)
$status.Size = New-Object System.Drawing.Size(590, 175)
$status.Multiline = $true
$status.ReadOnly = $true
$status.ScrollBars = 'Vertical'
$status.Text = '도우미 대기 중. 대시보드가 연결 전 화면이면 먼저 PC 연결을 해주세요.'
$form.Controls.Add($status)

function Start-Writer($command, $inputValue = '') {
  if ($script:worker) { return }
  try {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $NodePath
    $info.Arguments = '"' + $entry + '" ' + $command
    $info.WorkingDirectory = $root
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $info.StandardErrorEncoding = [System.Text.Encoding]::UTF8
    $info.EnvironmentVariables['WRITER_DESKTOP'] = '1'
    $script:worker = New-Object System.Diagnostics.Process
    $script:worker.StartInfo = $info
    [void]$script:worker.Start()
    $script:output = $script:worker.StandardOutput.ReadToEndAsync()
    $script:errors = $script:worker.StandardError.ReadToEndAsync()
    $script:mode = $command
    if ($command -eq 'pair') { $script:worker.StandardInput.WriteLine($inputValue); $code.Clear() }
    $pair.Enabled = $false; $login.Enabled = $false; $start.Enabled = $false
    $confirmed.Enabled = $command -eq 'login'
    $stop.Enabled = $command -eq 'start'
    $status.Text = switch ($command) {
      'pair' { 'PC 연결을 등록하고 있습니다.' }
      'login' { '열린 전용 Chrome에서 직접 로그인하세요. 글쓰기 화면이 보이면 이 창의 로그인 완료를 누르세요. 비밀번호는 이 창에 입력하지 마세요.' }
      'start' { '도우미 프로세스를 시작했습니다. 대시보드 팝업에서 PC 도우미 실행 중으로 바뀌면 현재 원고 보내기를 누르세요. 이 창은 켜두세요.' }
    }
  } catch {
    $script:worker = $null
    $pair.Enabled = $true; $login.Enabled = $true; $start.Enabled = $true
    $status.Text = '도우미를 시작하지 못했습니다. Node.js 및 도우미 설치 상태를 확인해야 합니다.'
  }
}
$pair.Add_Click({
  $value = $code.Text.Trim()
  if ($value -cnotmatch '^[a-f0-9]{64}$') { $status.Text = '대시보드에서 만든 1회용 연결 코드 전체를 붙여넣으세요.'; return }
  Start-Writer 'pair' $value
})
$login.Add_Click({ Start-Writer 'login' })
$confirmed.Add_Click({
  if ($script:worker -and !$script:worker.HasExited -and $script:mode -eq 'login') {
    $script:worker.StandardInput.WriteLine('')
    $confirmed.Enabled = $false
    $status.Text = '로그인된 글쓰기 화면을 확인하고 있습니다.'
  }
})
$start.Add_Click({ Start-Writer 'start' })
$stop.Add_Click({
  if ($script:worker -and !$script:worker.HasExited) {
    $answer = [System.Windows.Forms.MessageBox]::Show('중지하면 전용 브라우저가 닫힙니다. 작성 중인 내용과 임시저장 여부를 먼저 확인했나요?', '도우미 중지', 'YesNo', 'Warning')
    if ($answer -eq 'Yes') { $script:worker.StandardInput.WriteLine('stop'); $stop.Enabled = $false; $status.Text = '안전하게 중지 중입니다. 진행 중 작업이 있으면 잠시 기다려주세요.' }
  }
})
$dashboard.Add_Click({ Start-Process 'https://carrot-blog.web.app/contents' })
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 500
$timer.Add_Tick({
  if ($script:worker -and $script:worker.HasExited -and $script:output.IsCompleted -and $script:errors.IsCompleted) {
    $result = ($script:output.Result + "`r`n" + $script:errors.Result).Trim()
    $result = $result -replace 'npm run writer:pair', '도우미 창의 PC 연결' -replace 'npm run writer:login', '네이버 로그인 버튼' -replace 'npm run writer:start', '실행 시작 버튼'
    $status.Text = if ($result) { $result } else { '도우미가 종료되었습니다.' }
    $script:worker.Dispose(); $script:worker = $null
    $pair.Enabled = $true; $login.Enabled = $true; $start.Enabled = $true
    $confirmed.Enabled = $false; $stop.Enabled = $false
  }
})
$form.Add_FormClosing({
  param($sender, $eventArgs)
  if ($script:worker -and !$script:worker.HasExited) {
    $eventArgs.Cancel = $true
    [void][System.Windows.Forms.MessageBox]::Show('실행 중이면 실행 중지를 먼저 눌러주세요. 로그인 창이 열려 있다면 로그인 완료 또는 전용 Chrome 닫기로 마무리해주세요.', '도우미 실행 중')
  }
})
$timer.Start()
try { [void]$form.ShowDialog() } finally { $timer.Stop(); $timer.Dispose(); $form.Dispose() }
