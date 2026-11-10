import './App.css'

function App() {
  return (
    <div>
      <h1>☁️ HelloCloud</h1>
      <h2>우리 팀의 협업 플랫폼</h2>

      <p>HelloCloud에 오신 것을 환영합니다!</p>

      <button onClick={() => alert('로그인 기능 준비 중입니다!')}>
        로그인
      </button>

      <button onClick={() => alert('조직 생성 기능 준비 중입니다!')}>
        조직 생성
      </button>
    </div>
  )
}

export default App