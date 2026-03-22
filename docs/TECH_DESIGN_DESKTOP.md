# Secretariat Desktop 技術設計 v1

## 1. 目的

複数の名義(プロジェクト大分類)を横断して、週次目標と実績時間を管理するデスクトップアプリを構築する。

## 2. アーキテクチャ

- UI: React + TypeScript
- Desktop: Tauri 2
- ローカル永続化: SQLite (Tauri plugin sql または rusqlite)
- 将来同期: APIサーバ追加でクラウド同期対応

## 3. 画面構成

1. ダッシュボード
- 円グラフ(名義別配分)
- 名義別リスト(目標/実績/達成率)
- 現在計測中カード

2. 名義管理
- 名義の作成/編集/削除

3. 作業終了モーダル
- 今日の作業メモ
- 次回やること

4. 日誌一覧
- 名義ごとに作業履歴を表示

5. 設定
- 週開始曜日
- 週総時間
- ポモドーロ時間(作業/短休憩/長休憩)

## 4. データモデル(初期案)

### projects
- id (string)
- name (string)
- color (string)
- archived (boolean)
- created_at (datetime)

### weekly_targets
- id (string)
- project_id (string)
- week_start_date (date)
- target_minutes (integer)

### work_sessions
- id (string)
- project_id (string)
- started_at (datetime)
- ended_at (datetime|null)
- duration_minutes (integer|null)

### session_notes
- id (string)
- session_id (string)
- work_note (text)
- next_action_note (text)

### app_settings
- id (string)
- week_starts_on (integer: 0-6)
- weekly_capacity_minutes (integer)
- pomodoro_work_minutes (integer)
- pomodoro_short_break_minutes (integer)
- pomodoro_long_break_minutes (integer)

## 5. 制約ルール

- 同時計測は不可: ended_atがnullのwork_sessionは常に最大1件
- 達成率(初期): 実績分 / 目標分 * 100
- 週目標合計が週総時間を超えた場合は警告表示

## 6. 実装フェーズ

### Phase 1: 土台
- 画面ルーティング
- SQLite接続
- 名義CRUD

### Phase 2: 計測
- 開始/停止
- 同時計測制約
- 終了モーダル + メモ保存

### Phase 3: 可視化
- 週集計
- 円グラフ
- 達成率表示

### Phase 4: 通知
- ポモドーロ通知
- 休憩リマインド

## 7. 将来拡張

- メール/パスワード認証
- クラウド同期
- AIによる日誌ベース進捗評価
