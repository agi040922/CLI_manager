# Keyboard Shortcut Checklist

새로운 단축키를 추가할 때 반드시 아래 4곳을 모두 업데이트한다.

## 필수 변경 파일

1. **`src/shared/types.ts`**
   - `ShortcutAction` 타입에 액션 추가
   - `DEFAULT_SHORTCUTS`에 기본 키 바인딩 추가
   - `SHORTCUT_LABELS`에 라벨/설명/그룹 추가 (이것이 Settings > Keyboard UI에 자동 표시됨)

2. **`src/renderer/src/hooks/useKeyboardShortcuts.ts`**
   - `UseKeyboardShortcutsConfig` 인터페이스에 콜백 추가
   - `handleKeyDown`에서 액션 처리 로직 추가
   - dependency array에 콜백 추가

3. **`src/renderer/src/App.tsx`**
   - `useKeyboardShortcuts()` 호출 시 콜백 전달

4. **CLAUDE.md**
   - IPC나 기능 관련 섹션 업데이트
