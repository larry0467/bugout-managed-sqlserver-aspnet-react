Add-Type -AssemblyName System.Security
Add-Type -Path "d:\Officials\BugOutManaged\BugsManaged.Api\bin\Debug\net10.0\BCrypt.Net-Next.dll"

$password = "Admin@123"
$hash = [BCrypt.Net.BCrypt]::HashPassword($password)
Write-Host "Password: $password"
Write-Host "BCrypt Hash: $hash"
