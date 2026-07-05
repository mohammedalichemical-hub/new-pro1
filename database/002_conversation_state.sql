-- تتبع أين وصل كل رقم واتساب بخطوات الحجز (state machine بسيطة)

CREATE TABLE conversation_states (
  whatsapp_number TEXT PRIMARY KEY,
  step TEXT NOT NULL DEFAULT 'idle',
  -- context يخزن بيانات مؤقتة أثناء المحادثة: الخدمة المختارة، التاريخ، إلخ
  context JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_conversation_states_updated_at
  BEFORE UPDATE ON conversation_states
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- علامة حتى ما نرسل نفس التذكير مرتين
ALTER TABLE appointments ADD COLUMN reminder_sent_at TIMESTAMPTZ;
