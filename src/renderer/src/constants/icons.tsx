import { Code2, Play, Package, GitBranch, Terminal, Database } from 'lucide-react'

/**
 * 템플릿 아이콘 매핑
 * 템플릿의 icon 필드를 실제 React 컴포넌트로 변환
 */
export const TEMPLATE_ICONS: Record<string, React.ReactElement> = {
    code: <Code2 size={12} />,
    play: <Play size={12} />,
    package: <Package size={12} />,
    git: <GitBranch size={12} />,
    database: <Database size={12} />,
    terminal: <Terminal size={12} />
}

/**
 * 템플릿 아이콘 가져오기
 * @param iconName - 아이콘 이름
 * @returns React 아이콘 컴포넌트
 */
export const getTemplateIcon = (iconName: string): React.ReactElement => {
    return TEMPLATE_ICONS[iconName] || TEMPLATE_ICONS.terminal
}
