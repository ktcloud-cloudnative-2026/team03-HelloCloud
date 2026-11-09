# ERD

[← README](../../README.md)

서비스마다 자기 DB를 가집니다. 다른 서비스의 DB는 직접 읽지 않고 API를 호출합니다. 다른 서비스의 데이터는 외래 키 없이 ID로만 저장합니다.

| 서비스 | DB | 파일 |
|---|---|---|
| user | MySQL | [user.md](user.md) |
| chat | MongoDB | [chat.md](chat.md) |
| file | MySQL | [file.md](file.md) |
| calendar | PostgreSQL | [calendar.md](calendar.md) |
| notification | MySQL | [notification.md](notification.md) |
| board | MySQL | [board.md](board.md) |
| meeting | PostgreSQL | [meeting.md](meeting.md) |
| document | MongoDB | [document.md](document.md) |

- 그림은 Mermaid로 씁니다. GitHub에서 바로 그림으로 보입니다
- 원본은 노션의 서비스별 ERD · API 페이지입니다. 바꿀 때는 노션과 이 폴더를 함께 고칩니다
- 테이블 변경 방법과 시드 데이터는 담당자가 구현하면서 정하고 이유를 PR에 적습니다
