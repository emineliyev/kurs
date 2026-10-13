from core.media_cleanup import track
from .models import Question, BankQuestion

# Each question owns its image file (copies are real file copies), so it can go with the row
track(Question, 'image')
track(BankQuestion, 'image')
