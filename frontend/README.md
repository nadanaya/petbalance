# 우애영 Frontend

반려동물 프로필과 하루 급여 제품을 바탕으로 6종 영양소의 총량·상태·추천 후보를 보여 주는 React/Vite 데모입니다.

**공개 데모:** https://wooaeyoung.github.io/Frontend/

## 실행 모드

| 모드 | 실행 방법 | 데이터·계산 |
| --- | --- | --- |
| 공개 데모 | GitHub Pages 링크 | Render Backend API, API 실패 시 브라우저 내장 데모 목록 |
| 로컬 통합 | `npm run dev` + FastAPI | `/api` 프록시를 통한 backend API |

```powershell
npm install
npm run dev
```

다른 백엔드 주소를 사용할 때는 `.env.example`을 `.env`로 복사한 뒤 `VITE_API_URL`을 설정합니다.

## 데이터 사용 원칙

- Open Pet Food Facts는 실제 제품명·브랜드·바코드 검색에 사용합니다. 데이터는 ODbL이며 사용자 기여형이라 정확성과 완전성이 보장되지 않습니다.
- 추적하는 칼슘, 인, 비타민 D, 비타민 E, 오메가3, 아연 **6종이 모두 있는 사료만** 실제값으로 합산합니다.
- 6종 중 하나라도 빠진 사료는 일부 값을 0으로 취급하지 않고, 완전사료 선택 시 최소 권장량 추정으로 표시합니다.
- 기준선은 FEDIAF Nutritional Guidelines 2025의 생애주기별 1000 kcal ME 값을 사용합니다. 추천 제품 수치는 기능 검증용 데모이며 수의학적 처방이나 실제 급여 결정을 대신하지 않습니다.

데이터 출처: https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/

영양 기준 출처: https://europeanpetfood.org/wp-content/uploads/2025/09/FEDIAF-Nutritional-Guidelines_2025-ONLINE.pdf

## 구현 범위

- 프로필 저장·불러오기, 급여 제품 검색·추가·하루 급여량 편집
- 검색되지 않는 제품의 영양성분 직접 입력
- 영양상태 요약, 성분별 합계, 기준선, 추정값·경고, 칼슘:인 비율
- 안전성 재평가 기반 추천과 제외 사유
- 분석 기록의 개별·전체 삭제

사진 인식(OCR), 최저가 비교, 처방·진단 기능은 이 데모 범위에 포함하지 않습니다.

## 검증

```powershell
npm run build
```

발표용 설계·자료구조·한계와 데모 순서는 [docs/presentation-guide.md](docs/presentation-guide.md)를 참고하세요.
