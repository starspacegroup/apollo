# Voice Chat Setup Script
# Run this script to set up the OpenAI API key for local development

Write-Host "🎤 Apollo Voice Chat Setup" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan
Write-Host ""

# Check if .dev.vars already exists
if (Test-Path ".dev.vars") {
    Write-Host "⚠️  .dev.vars file already exists." -ForegroundColor Yellow
    $overwrite = Read-Host "Do you want to overwrite it? (y/N)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Host "Setup cancelled." -ForegroundColor Yellow
        exit 0
    }
}

Write-Host ""
Write-Host "📋 To use the Voice Chat feature, you need an OpenAI API key." -ForegroundColor White
Write-Host ""
Write-Host "Get your API key from: https://platform.openai.com/api-keys" -ForegroundColor Cyan
Write-Host ""

$apiKey = Read-Host "Enter your OpenAI API key"

if ([string]::IsNullOrWhiteSpace($apiKey)) {
    Write-Host "❌ No API key provided. Setup cancelled." -ForegroundColor Red
    exit 1
}

# Create .dev.vars file
$content = "# Local development environment variables`nOPENAI_API_KEY=$apiKey`n"
Set-Content -Path ".dev.vars" -Value $content

Write-Host ""
Write-Host "✅ Successfully created .dev.vars file!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Run: npm run dev" -ForegroundColor White
Write-Host "2. Open: http://localhost:5173/voice" -ForegroundColor White
Write-Host ""
Write-Host "For production deployment:" -ForegroundColor Cyan
Write-Host "Run: npx wrangler secret put OPENAI_API_KEY" -ForegroundColor White
Write-Host ""
Write-Host "📖 See VOICE_CHAT_README.md for more details" -ForegroundColor Gray
