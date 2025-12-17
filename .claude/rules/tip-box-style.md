# Tip Box Style Guide

Tip 박스를 만들 때 아래 형태와 크기를 따른다.

## 표준 스타일

```tsx
<div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded">
    <p className="text-xs text-blue-200">
        <strong>Tip:</strong> 내용
    </p>
</div>
```

## 규칙

- 이모지 사용 금지 (💡 등)
- `<strong>Tip:</strong>` 텍스트 형태 사용
- 폰트 크기: `text-xs`
- 패딩: `p-3`
- 배경: `bg-blue-500/10`
- 테두리: `border border-blue-500/20 rounded`
- 텍스트 색상: `text-blue-200`
