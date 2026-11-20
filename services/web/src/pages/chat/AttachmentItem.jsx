import { useState } from 'react'
import { getDownloadUrl, getPreviewUrl } from '../../api/files'
import { openFilePreview } from '../filePreview.js'
import { attachmentErrorMessage, previewKind, safeUrl } from './attachments'

// 메시지에 붙은 파일 하나. 권한은 미리보기 · 다운로드 주소를 받을 때 file 서비스가 확인한다(US-08)
function AttachmentItem({ attachment, onError }) {
  const [imageUrl, setImageUrl] = useState(null)
  const [busy, setBusy] = useState(false)
  const kind = previewKind(attachment.contentType)

  const run = async (action) => {
    setBusy(true)
    try {
      await action()
    } catch (e) {
      onError(`${attachment.name}: ${attachmentErrorMessage(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const showInline = () =>
    run(async () => {
      const { url } = await getPreviewUrl(attachment.fileId)
      setImageUrl(safeUrl(url))
    })

  const openTab = () =>
    run(() =>
      openFilePreview(
        { id: attachment.fileId, contentType: attachment.contentType },
        { getPreviewUrl, openWindow: () => window.open('about:blank', '_blank') },
      ),
    )

  // 서명된 주소로 이동하며 로그인 토큰을 저장소에 보내지 않는다(파일 화면과 같은 방식)
  const download = () =>
    run(async () => {
      const { url } = await getDownloadUrl(attachment.fileId)
      const link = document.createElement('a')
      link.href = safeUrl(url)
      link.rel = 'noreferrer'
      link.referrerPolicy = 'no-referrer'
      document.body.appendChild(link)
      link.click()
      link.remove()
    })

  return (
    <li className="chat-attachment">
      <div className="chat-attachment-row">
        <span className="chat-attachment-icon" aria-hidden="true">
          {kind === 'inline' ? '🖼' : kind === 'tab' ? '📄' : '📎'}
        </span>
        <span className="chat-attachment-name">{attachment.name}</span>
        {kind === 'inline' && (
          <button type="button" className="chat-chip" disabled={busy} onClick={imageUrl ? () => setImageUrl(null) : showInline}>
            {imageUrl ? '접기' : '미리보기'}
          </button>
        )}
        {kind === 'tab' && (
          <button type="button" className="chat-chip" disabled={busy} onClick={openTab}>
            미리보기
          </button>
        )}
        <button type="button" className="chat-chip" disabled={busy} onClick={download}>
          내려받기
        </button>
      </div>
      {imageUrl && (
        <img
          className="chat-attachment-image"
          src={imageUrl}
          alt={attachment.name}
          referrerPolicy="no-referrer"
          onError={() => {
            setImageUrl(null)
            onError(`${attachment.name}: 미리보기 주소가 만료됐어요. 다시 눌러 주세요.`)
          }}
        />
      )}
    </li>
  )
}

export default AttachmentItem
