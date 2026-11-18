# PlayCarGame — 一键从 Windows 发布到阿里云
# 用法：
#   pwsh -File scripts\deploy-remote.ps1            # 提交(可选) + 推送 + 远端发布
#   pwsh -File scripts\deploy-remote.ps1 -NoCommit  # 只推送已提交内容并发布
param(
  [string]$Message = "",
  [switch]$NoCommit,
  [string]$SshKey = "D:\ssh\.ssh\id_ed25519",
  [string]$Server = "root@47.86.40.17"
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo
try {
  if (-not $NoCommit) {
    $changes = git status --porcelain
    if ($changes) {
      if ([string]::IsNullOrWhiteSpace($Message)) { $Message = "Update PlayCarGame ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))" }
      git add -A
      git commit -m $Message | Out-Null
      Write-Host "已提交: $Message"
    } else {
      Write-Host "工作区干净，跳过提交"
    }
  }
  git push origin HEAD:main
  Write-Host "已推送到 GitHub"
  $remote = 'bash /opt/playcargame/deploy/deploy.sh'
  ssh -o StrictHostKeyChecking=no -i $SshKey $Server $remote
} finally {
  Pop-Location
}
