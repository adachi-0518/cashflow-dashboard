# 資金繰りダッシュボード

React + Vite + TypeScript で作った、個人用のローカル専用資金繰り管理アプリです。  
家計簿ではなく、今後 90 日のイベントをもとに「今日あといくら使えるか」「月末にどれだけ余るか」「来月の引き落としで事故らないか」を確認することに特化しています。

**公開URL: https://adachi-0518.github.io/cashflow-dashboard/**

## データの保存場所について

入力したデータはすべて、閲覧しているブラウザの LocalStorage にだけ保存されます。サーバーにも GitHub にも送信されません。そのため次の点に注意してください。

- **URL(オリジン)ごとにデータは別物です。** `localhost:5173` と公開URLではデータを共有しません。移行するときは設定エリアの「JSONを書き出し」→ 移行先で「JSONを読み込み」を使ってください。
- ブラウザのサイトデータを削除するとデータも消えます。定期的に JSON を書き出しておくのが安全です。
- 端末やブラウザをまたいだ同期はありません。

## セットアップ方法

```bash
npm install
```

## 起動方法

```bash
npm run dev
```

Mac で毎回ターミナルを開きたくない場合は、プロジェクト直下の `起動.command` をダブルクリックしても起動できます。  
初回だけ警告が出る場合は、右クリックして「開く」を選んで許可してください。

ビルド確認:

```bash
npm run build
```

## アプリ概要

- 1 画面で結論、アラート、イベント根拠、日々の更新、設定編集まで完結します
- 保存は LocalStorage のみで、サーバー・DB・認証・クラウド同期はありません
- 初回ロード時はサンプルデータを投入します
- リロードしても入力内容を保持します

## データの考え方

アプリで扱う主要データは以下です。

- 口座: 現在残高を持つ現金系の保管先
- クレジットカード: 利用枠、締め日、引き落とし日、次回請求額、利用可能額を持つ
- サブスク: 毎月固定のカード利用として自動生成されるイベント
- 収入予定: 単発または毎月の入金予定
- 単発支出: 大きな支出だけを登録する

### カード入力の考え方

- `limit` は固定の設定値で、カード登録・設定エリアでのみ編集します
- 日々の更新入力では、利用枠は入力せず `snapshotDate` `nextBillingAmount` `availableAmount` を更新します
- `unsettledAmount` は原則として自動計算で扱います
- 自動計算式は `未確定利用額 = max(0, 利用枠 - 利用可能額 - 次回支払い額)` です
- 明細反映の遅れ、家族カードのタイムラグ、返金処理などでズレる場合だけ、詳細設定から手動上書きできます
- `snapshotDate` を基準に、次回請求額と未確定利用額がどの引き落とし日に乗るかを判定します
- カードごとに、引き落としを「締め日後の最初の引落日」または「締め月の翌月引落日」から選べます

### イベント生成ルール

- 収入予定は指定日に口座へ加算します
- 口座払いの単発支出は指定日に即時減算します
- カード払いの単発支出とサブスクは、まずカード利用イベントとして計上します
- カード利用イベントは、カードの締め日と引き落とし日から将来の引き落とし日に集約されます
- `nextBillingAmount` は確定済みの次回請求額として、最も近い引き落とし日に計上します
- `unsettledAmount` は原則自動計算した「今日のカード利用残」を使い、必要時だけ手動上書き値を優先します
- `enabled: false` のデータは予測から除外します

## 安全に使える額の考え方

「今日の安全に使える額」は、現在の合算口座残高から見て、今追加で使っても 90 日以内に残高不足を起こしにくい金額です。

計算の流れ:

1. 今日の口座残高を起点にする
2. 今後 90 日のイベントを日付順に並べる
3. 同日の処理順は保守的に `カード利用計上 → 口座振替 → 口座からの支出・引き落とし → 収入`
4. 各口座ごとに「将来いちばん低くなる残高」を求める
5. その最小残高を口座ごとに合計した値を、安全に使える額とする
6. どこか 1 口座でも将来マイナスになる見込みがあれば、安全額は 0 円として扱う

## 制約事項

- 予測対象は 90 日先までです
- 口座間振替は単発イベントとして扱います
- 現金、投資、ポイント、分割払い、リボ払いは扱っていません
- カード会社ごとの細かな締め処理差異までは再現していません
- 過去分析や家計簿用途には向いていません

## 今後の拡張案

- 残高推移のグラフ表示
- 主要イベントだけを絞るフィルタ
- 口座別の安全額シミュレーション
- 「この支出を追加したらどうなるか」の仮置きモード
- 予測ロジックの自動テスト（日付計算・カード締め日まわり）

## ディレクトリ構成

```text
src/
  components/
    AlertList.tsx
    ForecastTable.tsx
    QuickUpdatePanel.tsx
    SectionCard.tsx
    SettingsPanel.tsx
    SummaryCard.tsx
  data/
    constants.ts
    dataFile.ts
    normalizeAppData.ts
    sampleData.ts
  hooks/
    useCashflowStore.ts
    useLocalStorageState.ts
    useTodayDateString.ts
  lib/
    cardMetrics.ts
    forecast/
      calculateForecast.ts
      cardBilling.ts
      generateForecastEvents.ts
      index.ts
  types/
    forecast.ts
    models.ts
  utils/
    date.ts
    format.ts
    id.ts
  App.tsx
  main.tsx
  styles.css
```

## 主要ファイルの役割

- `src/App.tsx`: 1 画面ダッシュボードの構成と各パネルの接続
- `src/lib/forecast/generateForecastEvents.ts`: 90 日分の予測イベント生成
- `src/lib/forecast/calculateForecast.ts`: 安全額、月末自由額、不足アラートなどの計算
- `src/lib/forecast/cardBilling.ts`: 締め日と引き落とし日の解決ロジック
- `src/hooks/useCashflowStore.ts`: LocalStorage 永続化つきのデータ更新窓口
- `src/data/normalizeAppData.ts`: 読み込み・インポート時のデータ正規化（編集のたびには実行しない）
- `src/data/dataFile.ts`: JSON バックアップの書き出し・読み込み
- `src/lib/cardMetrics.ts`: 利用可能額から未確定利用額を求める計算と入力検証
- `src/components/QuickUpdatePanel.tsx`: 日々の残高・請求見込み更新と単発イベント追加
- `src/components/SettingsPanel.tsx`: 各マスタのインライン編集
