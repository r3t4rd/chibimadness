<#
.SYNOPSIS
Waits for the GitHub Actions release workflow of the newest remote SemVer tag.

.EXAMPLE
.\scripts\watch-latest-tag-release.ps1
.\scripts\watch-latest-tag-release.ps1 -OpenRelease
#>
[CmdletBinding()]
param(
  [ValidateRange(5, 120)]
  [int]$PollSeconds = 15,
  [switch]$OpenRelease
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw 'GitHub CLI (gh) is required. Install it, then run: gh auth login'
}

function Get-GitHubRepository {
  $remote = (git remote get-url origin).Trim()
  if ($remote -match 'github\.com[/:]([^/]+)/([^/.]+?)(?:\.git)?$') {
    return "$($Matches[1])/$($Matches[2])"
  }
  throw "origin is not a GitHub repository: $remote"
}

function Get-LatestRemoteTag {
  $tags = git ls-remote --tags origin 'refs/tags/v*' |
    ForEach-Object {
      $parts = $_ -split "`t"
      if ($parts.Count -ne 2 -or $parts[1].EndsWith('^{}')) { return }
      $tag = $parts[1] -replace '^refs/tags/', ''
      if ($tag -match '^v(\d+)\.(\d+)\.(\d+)$') {
        [PSCustomObject]@{
          Tag = $tag
          Version = [version]"$($Matches[1]).$($Matches[2]).$($Matches[3])"
        }
      }
    } |
    Sort-Object Version -Descending

  if (-not $tags) { throw 'No SemVer tags matching vX.Y.Z found on origin.' }
  return $tags[0].Tag
}

$repository = Get-GitHubRepository
$tag = Get-LatestRemoteTag
Write-Host "Watching $repository release for $tag ..." -ForegroundColor Cyan

while ($true) {
  $runs = gh run list --repo $repository --workflow release.yml --branch $tag --limit 20 `
    --json databaseId,headBranch,status,conclusion,url,headSha | ConvertFrom-Json
  $run = $runs | Where-Object { $_.headBranch -eq $tag } | Select-Object -First 1

  if (-not $run) {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] workflow has not appeared yet" -ForegroundColor DarkYellow
  } elseif ($run.status -ne 'completed') {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ${tag}: $($run.status)  $($run.url)" -ForegroundColor Yellow
  } elseif ($run.conclusion -eq 'success') {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $tag released successfully: $($run.url)" -ForegroundColor Green
    if ($OpenRelease) { Start-Process $run.url }
    exit 0
  } else {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $tag failed ($($run.conclusion)): $($run.url)" -ForegroundColor Red
    if ($OpenRelease) { Start-Process $run.url }
    exit 1
  }

  Start-Sleep -Seconds $PollSeconds
}
