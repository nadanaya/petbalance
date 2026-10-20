# PDF 상세설계 구현 기록

## 2026-10-13

- `우애영_상세설계보고서_통합최종본1.pdf` 37쪽 중 기능 현황(21쪽), 남은 작업(22쪽), 화면 흐름·입력·결과 원칙(34~35쪽)을 검토했다.
- Hermes CLI 설치와 `hermes verify --detect-only --json`을 확인했다. 감지된 Vite 검증 절차는 `npm install`, `npm run build`, `npm run dev`다.
- 실제 의료 기준 확정·제품 출처 검증은 별도 데이터 검증이 필요하므로 데모 분석 범위로 유지한다.
- 분석 결과에 기준 버전, 6종 성분 범위, 추정 데이터 여부, 진단·처방 비해당 안내를 묶어 표시했다.
- `hermes verify --skip-start --json` 결과: bootstrap(`npm install`)와 build(`npm run build`) 성공. 자동 테스트 스크립트는 프로젝트에 등록되어 있지 않다. npm audit은 의존성 3건(중간 1, 높음 2)을 보고했으며 이번 UI 변경에서 자동 수정하지 않았다.
- Vercel 프로덕션 배포 `dpl_3p6UaJX5VZKyRrHR969MqEHoyC3r`가 Ready 상태가 되었고, 공개 별칭에서 새 JS·CSS 번들 응답을 확인했다.
