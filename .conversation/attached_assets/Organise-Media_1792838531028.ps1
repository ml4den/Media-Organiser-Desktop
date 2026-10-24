# Configuration
$config = @{
    source = "D:\Mladen\Documents\Phone\DCIM\Camera"
    destination = "D:\Mladen\Pictures"
    operation = "Move"  # Can be "Copy" or "Move"
    excludePatterns = @(
        ".trashed",
        "temp",
        "delete"
        # Add more patterns here
    )
}

# Get system culture once
$systemCulture = [System.Globalization.CultureInfo]::CurrentCulture

# Function to check if file should be excluded
function Should-ExcludeFile {
    param(
        [string]$fileName
    )
    
    foreach ($pattern in $config.excludePatterns) {
        if ($fileName -like "*$pattern*") {
            Write-Host "Excluding file: $fileName (matches pattern: $pattern)"
            return $true
        }
    }
    return $false
}

# Function to move or copy file based on configuration
function Copy-OrMoveFile {
    param(
        [string]$source,
        [string]$destination
    )
    
    if ($config.operation -eq "Copy") {
        Copy-Item -Path $source -Destination $destination -Force
        Write-Host "Copied: $source -> $destination"
    } else {
        Move-Item -Path $source -Destination $destination -Force
        Write-Host "Moved: $source -> $destination"
    }
}

# Ensure the destination folder exists
if (!(Test-Path -Path $config.destination)) {
    New-Item -ItemType Directory -Path $config.destination | Out-Null
}

# Load the Windows Image Acquisition (WIA) COM object for EXIF data extraction
Add-Type -AssemblyName System.Drawing

# Create Shell.Application COM object for video metadata
$shell = New-Object -ComObject Shell.Application

# Function to clean date string
function Clean-DateString {
    param($dateStr)
    # Remove all non-printable characters and normalize spaces
    $cleaned = $dateStr -replace '[^\x20-\x7E]', ''
    return $cleaned.Trim()
}

# Function to parse date string using system culture
function Parse-DateWithCulture {
    param(
        [string]$dateStr,
        [System.Globalization.CultureInfo]$culture
    )
    
    try {
        $result = [DateTime]::Parse($dateStr, $culture)
        Write-Host "Successfully parsed date using culture: $($culture.Name)"
        return $result
    } catch {
        Write-Host "Failed to parse date using culture $($culture.Name): $_"
        return $null
    }
}

# Function to get date from video metadata
function Get-VideoCreationDate {
    param(
        [string]$filePath,
        [System.Globalization.CultureInfo]$culture
    )
    
    try {
        $folder = $shell.Namespace([System.IO.Path]::GetDirectoryName($filePath))
        $file = $folder.ParseName([System.IO.Path]::GetFileName($filePath))
        
        # Get all available properties
        for ($i = 0; $i -le 400; $i++) {
            $propertyName = $folder.GetDetailsOf($null, $i)
            if ($propertyName -eq "Media created") {
                $dateStr = $folder.GetDetailsOf($file, $i)
                if ($dateStr) {
                    $dateStr = Clean-DateString $dateStr
                    Write-Host "Raw date string: $dateStr"
                    Write-Host "Cleaned date string: $dateStr"
                    
                    # Try parsing using provided culture
                    $result = Parse-DateWithCulture -dateStr $dateStr -culture $culture
                    if ($result) {
                        return $result
                    }
                    
                    # Fallback to invariant culture if system culture fails
                    $result = Parse-DateWithCulture -dateStr $dateStr -culture ([System.Globalization.CultureInfo]::InvariantCulture)
                    if ($result) {
                        return $result
                    }
                    
                    Write-Host "Failed to parse date string: $dateStr"
                    return $null
                }
            }
        }
    } catch {
        Write-Host "Error getting video metadata: $_"
        return $null
    }
    return $null
}

# Function to process EXIF date
function Get-ExifDate {
    param(
        [string]$filePath,
        [System.Globalization.CultureInfo]$culture
    )
    
    try {
        $image = [System.Drawing.Image]::FromFile($filePath)
        $exifProperties = $image.PropertyItems
        
        # Check multiple EXIF date fields
        $dateTakenProperty = $exifProperties | Where-Object { $_.Id -in @(0x9003, 0x132, 0x9004) } # DateTimeOriginal, DateTime, DateTimeDigitized
        
        if ($dateTakenProperty) {
            $dateTaken = [System.Text.Encoding]::ASCII.GetString($dateTakenProperty.Value).Substring(0, 19)
            $result = [datetime]::ParseExact($dateTaken, "yyyy:MM:dd HH:mm:ss", $culture)
            Write-Host "Detected EXIF Date: $result"
            $image.Dispose()
            return $result
        }
        $image.Dispose()
    } catch {
        Write-Host "Error processing EXIF for file: $filePath"
    }
    return $null
}

# Validate configuration
if ($config.operation -notin @("Copy", "Move")) {
    Write-Error "Invalid operation specified. Must be 'Copy' or 'Move'."
    exit 1
}

# Get all files in the source folder
$files = Get-ChildItem -Path $config.source -File

# Process files
$processedCount = 0
$skippedCount = 0
$excludedCount = 0

foreach ($file in $files) {
    # Check if file should be excluded
    if (Should-ExcludeFile -fileName $file.Name) {
        $excludedCount++
        continue
    }
    
    $dateTaken = $null
    
    # Handle different file types
    if ($file.Extension -eq ".mp4") {
        $dateTaken = Get-VideoCreationDate -filePath $file.FullName -culture $systemCulture
        if ($dateTaken) {
            Write-Host "Detected Media Created Date: $dateTaken for file: $($file.Name)"
        }
    } else {
        $dateTaken = Get-ExifDate -filePath $file.FullName -culture $systemCulture
    }
    
    if (-not $dateTaken) {
        Write-Host "No date found for file: $($file.Name). Skipping."
        $skippedCount++
        continue
    }
    
    # Define year and month subfolder structure
    $year = $dateTaken.Year
    $month = $dateTaken.Month.ToString("00")
    $targetFolder = Join-Path -Path $config.destination -ChildPath "$year\$month"
    
    # Create target directory if it doesn't exist
    if (!(Test-Path -Path $targetFolder)) {
        New-Item -ItemType Directory -Path $targetFolder | Out-Null
    }
    
    # Move or copy the file to the new location
    $targetPath = Join-Path -Path $targetFolder -ChildPath $file.Name
    Copy-OrMoveFile -source $file.FullName -destination $targetPath
    $processedCount++
}

# Clean up COM objects
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($shell) | Out-Null
[System.GC]::Collect()
[System.GC]::WaitForPendingFinalizers()

# Display summary
Write-Host "`nOperation Summary:"
Write-Host "----------------"
Write-Host "Operation mode: $($config.operation)"
Write-Host "Files processed: $processedCount"
Write-Host "Files skipped (no date): $skippedCount"
Write-Host "Files excluded: $excludedCount"
Write-Host "Total files: $($files.Count)"
Write-Host "Operation complete."