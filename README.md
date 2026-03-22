# Secretariat Desktop (Tauri + React + TypeScript)

Secretariatのデスクトップ版の初期土台です。
青白ストライプのUIテーマを適用した、時間管理ダッシュボードの雛形になっています。

## 使用技術

- Frontend: React + TypeScript + Vite
- Desktop shell: Tauri 2 (Rust)
- Runtime: Node.js / npm

## 必要な開発環境

WindowsでのTauri開発には以下が必要です。

1. Node.js (導入済み)
2. Rust (導入済み)
3. Visual Studio Build Tools 2022 (MSVC + Windows SDK)

### Build Toolsの推奨インストール

Rustは入っていても、Build Toolsが無いと`npm run tauri dev`が失敗します。

PowerShellで以下を実行:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--quiet --wait --norestart --nocache --installPath C:\\BuildTools --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.Windows10SDK.19041"
```

インストール後、ターミナルを再起動してください。

## セットアップ

```powershell
npm install
```

## 開発起動

```powershell
npm run tauri dev
```

## フロントのみ確認したい場合

デスクトップ起動前にUIだけ確認したいとき:

```powershell
npm run dev
```

## ビルド

```powershell
npm run build
```

## 現在の実装状態

- 青白ストライプのベーステーマ
- ダッシュボード風のプレースホルダーUI
- 名義別の週間進捗リスト表示枠
- 作業開始ボタンの配置

次は、タイマー状態管理とSQLite永続化を実装していく想定です。
