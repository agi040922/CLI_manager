# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CLImanger는 Electron 기반 터미널 관리 애플리케이션입니다. 여러 워크스페이스와 터미널 세션을 관리하고, Git worktree 기능을 지원하며, 로컬 포트 모니터링 기능을 제공합니다.

## Tech Stack

- **Framework**: Electron + React
- **Build Tool**: electron-vite
- **UI**: TailwindCSS + framer-motion
- **Terminal**: xterm.js + node-pty
- **Storage**: electron-store
- **Package Manager**: pnpm

## Development Commands

```bash
# 개발 서버 시작 (HMR 지원)
pnpm dev

# 프로덕션 빌드
pnpm build

# 빌드된 앱 미리보기
pnpm preview
# 또는
pnpm start

# 타입 체크
pnpm typecheck
```

## Architecture

### Process Structure (Electron Multi-Process)

1. **Main Process** (`src/main/`)
   - `index.ts`: 앱 초기화, IPC 핸들러, 워크스페이스/세션 관리
   - `TerminalManager.ts`: node-pty를 사용한 터미널 프로세스 생성/관리
   - `PortManager.ts`: macOS `lsof` 명령어로 localhost 포트 모니터링 (5초마다)

2. **Renderer Process** (`src/renderer/`)
   - `App.tsx`: 메인 애플리케이션 컴포넌트, 상태 관리
   - `components/Sidebar.tsx`: 워크스페이스/세션 목록 UI
   - `components/TerminalView.tsx`: xterm.js 터미널 인스턴스
   - `components/StatusBar.tsx`: 포트 모니터링 정보 표시

3. **Preload** (`src/preload/`)
   - `index.ts`: Main ↔ Renderer IPC 브릿지 (contextBridge)

4. **Shared** (`src/shared/`)
   - `types.ts`: Main/Renderer 공통 TypeScript 타입 정의

### Key Features

- **Workspace Management**: 폴더를 워크스페이스로 추가하고 여러 터미널 세션 관리
- **Playground**: 임시 작업용 디렉토리 자동 생성 (Downloads 폴더에 timestamp 기반)
- **Git Worktree Support**: 브랜치별 worktree를 자동으로 생성하고 터미널 세션 연결
- **Port Monitoring**: 로컬 개발 서버 포트를 실시간 감지 및 표시 (macOS only)
- **Session Persistence**: 모든 터미널 세션을 DOM에 유지하여 탭 전환 시에도 상태 보존

### Data Flow

```
User Action (Renderer)
  → IPC Call (Preload)
    → IPC Handler (Main)
      → electron-store (Persistent Storage)
        → Response to Renderer
          → UI Update
```

### Terminal Session Lifecycle

1. 사용자가 세션 추가 요청
2. Main process에서 UUID 생성 및 세션 정보 저장
3. Renderer에서 TerminalView 컴포넌트 생성
4. TerminalView가 mount 시 `terminal-create` IPC 호출
5. TerminalManager가 node-pty 프로세스 생성
6. pty 데이터를 `terminal-output-{id}` 채널로 브로드캐스트
7. 해당 TerminalView가 xterm.js에 데이터 렌더링

### Storage Schema (electron-store)

```typescript
{
  workspaces: [
    {
      id: string,
      name: string,
      path: string,
      sessions: [
        {
          id: string,
          name: string,
          cwd: string,
          type: 'regular' | 'worktree'
        }
      ],
      createdAt: number,
      isPlayground?: boolean
    }
  ],
  playgroundPath: string
}
```

## Important Notes

### macOS-Specific Features

- **Port Monitoring**: `lsof` 명령어는 macOS/Linux 전용이므로 Windows에서는 동작하지 않습니다
- **Vibrancy Effect**: macOS 전용 투명 유리 효과 UI 사용
- **Default Shell**: macOS는 `zsh`, Windows는 `powershell.exe` 사용

### Terminal Management

- 모든 터미널 세션은 React 컴포넌트가 unmount되어도 node-pty 프로세스는 유지됩니다
- 세션 전환 시 `display: none`으로 숨기기만 하여 터미널 상태 보존
- 터미널 크기 조정은 FitAddon을 사용하여 자동으로 처리

### Git Worktree

- Worktree 생성 시 부모 디렉토리는 `{workspace-path}/../{workspace-name}-worktrees/{branch-name}` 형식
- 브랜치가 이미 존재하면 worktree 생성 실패 (simple-git의 raw 명령어 사용)

### IPC Communication

- **Invoke/Handle**: 비동기 요청-응답 패턴 (워크스페이스 CRUD)
- **Send/On**: 단방향 이벤트 스트림 (터미널 입력, 포트 업데이트)
- 터미널 데이터는 모든 BrowserWindow에 브로드캐스트되므로 Renderer에서 ID로 필터링 필요

### Build Configuration

- `electron-vite`는 Main/Preload/Renderer를 별도로 번들링
- Renderer는 Vite + React HMR 지원
- Main/Preload는 CommonJS 모듈 시스템 사용 (`type: "commonjs"`)
