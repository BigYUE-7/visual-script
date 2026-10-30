# api-key.ps1 —— 大模型 API 密钥管理脚本
# 密钥统一保存在仓库根目录的 config/llm-api.json（已在 .gitignore 中忽略，不会提交）。
# 约定：AI / agent 一律不得读取该文件内容；增删改一律通过本脚本，由用户本人交互输入密钥。
#
# 用法（在仓库根目录执行）：
#   powershell -ExecutionPolicy Bypass -File scripts/api-key.ps1 init
#   powershell -ExecutionPolicy Bypass -File scripts/api-key.ps1 add deepseek
#   powershell -ExecutionPolicy Bypass -File scripts/api-key.ps1 list
#   powershell -ExecutionPolicy Bypass -File scripts/api-key.ps1 remove deepseek

param(
    [Parameter(Position = 0)]
    [ValidateSet('help', 'init', 'add', 'list', 'remove')]
    [string]$Action = 'help',

    [Parameter(Position = 1)]
    [string]$Provider
)

$ErrorActionPreference = 'Stop'

$Root       = Split-Path -Parent $PSScriptRoot
$ConfigDir  = Join-Path $Root 'config'
$ConfigPath = Join-Path $ConfigDir 'llm-api.json'

$DefaultBaseUrls = @{
    'deepseek'    = 'https://api.deepseek.com'
    'openai'      = 'https://api.openai.com/v1'
    'anthropic'   = 'https://api.anthropic.com'
    'dashscope'   = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    'moonshot'    = 'https://api.moonshot.cn/v1'
    'zhipu'       = 'https://open.bigmodel.cn/api/paas/v4'
    'siliconflow' = 'https://api.siliconflow.cn/v1'
    'ollama'      = 'http://localhost:11434/v1'
}

function Write-Utf8NoBom {
    param([string]$Path, [string]$Text)
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding($false)))
}

function New-EmptyConfig {
    return [ordered]@{ version = 1; providers = [ordered]@{} }
}

function Save-Config {
    param($Config)
    Write-Utf8NoBom -Path $ConfigPath -Text ($Config | ConvertTo-Json -Depth 10)
}

function Load-Config {
    if (Test-Path -LiteralPath $ConfigPath) {
        $text = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8
        if (-not [string]::IsNullOrWhiteSpace($text)) {
            return ($text | ConvertFrom-Json)
        }
    }
    Write-Host "未找到有效的配置文件，已自动初始化：$ConfigPath"
    $newConfig = New-EmptyConfig
    Save-Config -Config $newConfig
    return $newConfig
}

function Get-Providers {
    param($Config)
    $result = [ordered]@{}
    if ($null -ne $Config.providers) {
        foreach ($prop in $Config.providers.PSObject.Properties) {
            $result[$prop.Name] = $prop.Value
        }
    }
    return $result
}

function Read-PlainSecret {
    param([string]$Prompt)
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function Mask-Key {
    param([string]$Key)
    if ([string]::IsNullOrEmpty($Key)) { return '(未设置)' }
    if ($Key.Length -le 8) { return ('*' * $Key.Length) }
    return $Key.Substring(0, 4) + ('*' * 8) + $Key.Substring($Key.Length - 4)
}

function Show-Help {
    Write-Host ''
    Write-Host '大模型 API 密钥管理'
    Write-Host ''
    Write-Host '用法（在仓库根目录执行）：'
    Write-Host '  powershell -ExecutionPolicy Bypass -File scripts/api-key.ps1 init             初始化配置文件'
    Write-Host '  powershell -ExecutionPolicy Bypass -File scripts/api-key.ps1 add [provider]   交互式添加/更新密钥'
    Write-Host '  powershell -ExecutionPolicy Bypass -File scripts/api-key.ps1 list             列出已配置项（密钥打码）'
    Write-Host '  powershell -ExecutionPolicy Bypass -File scripts/api-key.ps1 remove provider  删除某个 Provider'
    Write-Host ''
    Write-Host '说明：'
    Write-Host '  - 密钥保存在 config/llm-api.json，已被 .gitignore 忽略，不会提交到仓库。'
    Write-Host '  - AI / agent 不得读取该文件内容；请勿把密钥粘贴到对话、文档或代码中。'
    Write-Host '  - 添加密钥时由本脚本交互式询问，输入不会回显，也不会进入命令历史。'
    Write-Host ''
}

switch ($Action) {
    'help' {
        Show-Help
        break
    }

    'init' {
        if (Test-Path -LiteralPath $ConfigPath) {
            Write-Host "配置文件已存在：$ConfigPath"
        }
        else {
            Save-Config -Config (New-EmptyConfig)
            Write-Host "已创建空配置文件：$ConfigPath"
        }
        break
    }

    'add' {
        $config = Load-Config
        $providers = Get-Providers -Config $config

        $name = $Provider
        if ([string]::IsNullOrWhiteSpace($name)) {
            $name = Read-Host '请输入 Provider 名称（如 deepseek、openai、qwen）'
        }
        $name = ([string]$name).Trim().ToLowerInvariant()
        if ([string]::IsNullOrWhiteSpace($name)) {
            Write-Host '未输入 Provider 名称，已取消。'
            break
        }

        if ($providers.Contains($name)) {
            $answer = Read-Host "Provider '$name' 已存在，是否覆盖？(y/N)"
            if ($answer -notmatch '^[Yy]') {
                Write-Host '已取消。'
                break
            }
        }

        $defaultUrl = $DefaultBaseUrls[$name]
        if ($defaultUrl) {
            $url = ([string](Read-Host "Base URL（直接回车使用默认：$defaultUrl）")).Trim()
            if ([string]::IsNullOrWhiteSpace($url)) { $url = $defaultUrl }
        }
        else {
            $url = ([string](Read-Host 'Base URL（可留空）')).Trim()
        }

        $models = @()
        $modelsRaw = Read-Host '模型名（逗号分隔，可留空）'
        if (-not [string]::IsNullOrWhiteSpace($modelsRaw)) {
            $models = @($modelsRaw -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
        }

        $key = Read-PlainSecret -Prompt 'API Key（输入不显示）'
        if ([string]::IsNullOrWhiteSpace($key)) {
            Write-Host '未输入 API Key，已取消。'
            break
        }
        $key = $key.Trim()

        $entry = [ordered]@{ apiKey = $key }
        if (-not [string]::IsNullOrEmpty($url)) { $entry['baseURL'] = $url }
        if ($models.Count -gt 0) { $entry['models'] = $models }

        $providers[$name] = [pscustomobject]$entry
        Save-Config -Config ([ordered]@{ version = 1; providers = $providers })

        Write-Host "已保存：config/llm-api.json → provider '$name'，密钥为 $(Mask-Key $key)"
        break
    }

    'list' {
        $config = Load-Config
        $providers = Get-Providers -Config $config

        if ($providers.Count -eq 0) {
            Write-Host '尚未配置任何 Provider。添加示例：'
            Write-Host '  powershell -ExecutionPolicy Bypass -File scripts/api-key.ps1 add deepseek'
            break
        }

        Write-Host ('{0,-14} {1,-46} {2}' -f 'Provider', 'BaseURL', 'API Key（打码）')
        Write-Host ('-' * 80)
        foreach ($name in $providers.Keys) {
            $item = $providers[$name]
            $url = '-'
            if ($item.baseURL) { $url = [string]$item.baseURL }
            Write-Host ('{0,-14} {1,-46} {2}' -f $name, $url, (Mask-Key ([string]$item.apiKey)))
        }
        break
    }

    'remove' {
        $config = Load-Config
        $providers = Get-Providers -Config $config

        $name = $Provider
        if ([string]::IsNullOrWhiteSpace($name)) {
            $name = Read-Host '请输入要删除的 Provider 名称'
        }
        $name = ([string]$name).Trim().ToLowerInvariant()

        if (-not $providers.Contains($name)) {
            Write-Host "未找到 Provider：$name（可先运行 list 查看）"
            break
        }

        $answer = Read-Host "确认删除 Provider '$name'？(y/N)"
        if ($answer -notmatch '^[Yy]') {
            Write-Host '已取消。'
            break
        }

        $providers.Remove($name)
        Save-Config -Config ([ordered]@{ version = 1; providers = $providers })
        Write-Host "已删除 Provider '$name'。"
        break
    }
}
