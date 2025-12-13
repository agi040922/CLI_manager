---
paths: src/**/*.{ts,tsx}
---

# Custom Dialog Icon

Electron의 dialog.showMessageBox() 사용 시 기본 Electron 로고 대신 커스텀 로고를 사용한다.

## 규칙

- `dialog.showMessageBox()` 호출 시 반드시 `icon` 옵션에 앱 로고 경로 지정
- 로고 경로: `resources/icon.png` (또는 프로젝트의 로고 파일)
- Renderer에서 `window.api.showMessageBox()` 사용 시에도 동일하게 적용

## 예시

```typescript
// Main process
import icon from '../../resources/icon.png?asset'

dialog.showMessageBox({
    type: 'question',
    title: 'Confirm',
    message: 'Are you sure?',
    buttons: ['Cancel', 'OK'],
    icon: icon  // 커스텀 로고 사용
})
```
