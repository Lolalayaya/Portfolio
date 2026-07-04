# Markdown Portfolio

這個網站的內容來源是 `content.md`。編輯 Markdown 後，腳本會重新產生 `index.html`。

## 使用方式

1. 安裝 Node.js 18 以上版本。
2. 執行 `npm run dev`。
3. 開啟 `http://localhost:5173`。
4. 編輯 `content.md`，儲存後瀏覽器會自動刷新。

只想產生靜態 HTML 時，執行：

```bash
npm run build
```

產生結果會寫入 `index.html`。

## Markdown 結構規則

`#` 是首頁 Hero 的大標題。

```markdown
# Lola Tseng UX Designer Portfolio
```

`>` 是每個區塊的小標籤。

```markdown
> Design inspired by everyday life
```

Hero 的按鈕使用連結清單。第一個連結會是主要按鈕，第二個之後是次要按鈕。

```markdown
- [View Projects](#work)
- [Let's Connect](#contact)
```

`---` 用來分隔頁面區塊。

`##` 是大區塊標題，可加上 `{#id .layout}` 控制導覽錨點與版型。

```markdown
## Work {#work .projects}
```

目前支援的版型 class：

- `.about`：個人介紹、技能標籤、照片
- `.philosophy`：設計理念卡片
- `.projects`：作品卡片
- `.process`：可展開的流程步驟
- `.playground`：實驗與草稿卡片
- `.journal`：文章列表
- `.life`：靈感表格卡片
- `.contact`：聯絡區塊

`###` 是中標題。在卡片型區塊中，每個 `###` 會變成一張卡片。

```markdown
### AI Insurance Recommendation

使用 AI 輔助保險需求盤點。

![Project cover](images/project-insurance.jpg)
```

`####` 是小標題，適合用在區塊內的次層級內容，例如技能清單前的標示。

```markdown
#### Skills

- UX Design
- Product Thinking
```

一般段落會變成文字段落。

```markdown
我關注人如何在生活中完成決策、建立信任，並在複雜資訊裡找到下一步。
```

無序清單使用 `-`，適合技能、連結與重點列點。

```markdown
- User Research
- Service Design
```

有序清單使用 `1.`，在 `.process` 區塊中會變成可展開的流程步驟。格式建議為 `**步驟名稱** - 說明`。

```markdown
1. **Observe** - 從生活、資料與現場脈絡收集訊號。
2. **Research** - 透過訪談與競品分析建立理解。
```

圖片使用標準 Markdown 圖片語法。圖片檔可放在 `images/` 資料夾。

```markdown
![Profile placeholder](images/profile.jpg "Photo or portrait")
```

表格使用標準 Markdown 表格語法。Hero 內的表格會變成膠囊標籤，`.life` 區塊的表格會變成靈感卡片。

```markdown
| Books | Movies | Travel |
| --- | --- | --- |
| Reading notes | Cinema details | City walks |
```

註解或引用使用 `>`。在區塊開頭會被渲染成黃色標籤。

```markdown
> Selected projects
```
