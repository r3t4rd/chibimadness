; Per-user Windows installer. The directory page remains enabled so a player
; can install the game anywhere without administrator rights.

#define MyAppName "ChibiMadness"
#define MyAppPublisher "r3t4rd"
#define MyAppExeName "chibimadness-desktop.exe"

#ifndef MyAppVersion
  #define MyAppVersion "dev"
#endif

#ifndef SourceLauncher
  #define SourceLauncher "..\\desktop\\target\\x86_64-pc-windows-msvc\\release\\chibimadness-desktop.exe"
#endif

#ifndef SourceGame
  #define SourceGame "..\\desktop\\target\\x86_64-pc-windows-msvc\\release\\chibimadness-game.exe"
#endif

[Setup]
AppId={{29C2B521-A8B6-485B-9B62-ED01C3EDDE16}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\ChibiMadness
DisableDirPage=no
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\release
OutputBaseFilename=ChibiMadness-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#MyAppName}

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Files]
; The launcher stays in the install directory. It downloads future native game
; hosts into LocalAppData, where a per-user installation can always update them.
Source: "{#SourceLauncher}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceGame}"; DestDir: "{app}\\runtime"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\ChibiMadness\web-patches"
Type: filesandordirs; Name: "{localappdata}\ChibiMadness\native-versions"
