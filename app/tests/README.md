# בדיקות גיבוי וסנכרון

ארסנל בדיקות מקצה לקצה (54 תרחישים): גיבוי, סנכרון בין מכשירים, התנתקות/התחברות, קליטה, אימות, שלמות נתונים, וחוקי האבטחה ב-Firebase האמיתי.

```
# 1. בנייה מול שרת מדומה
CLOUD_CONFIG=app/tests/cloud-test-config.json python app/build.py
# 2. שרתים
python app/tests/fakebase.py                       # Firebase מדומה על 8766
python -m http.server 8765 --bind 127.0.0.1 -d docs  # האפליקציה על 8765
# 3. הרצה (צריך puppeteer-core ו-Chrome)
node app/tests/suite.js
node app/tests/redirect.js      # כניסה בהפניה (אייפון)
node app/tests/friends-live.js  # לוז חי של חברים, לשוניות, לינק שיתוף, דמויות
node app/tests/ui-nav.js        # חיפוש קבוע בכותרת + לשונית פרופיל
# 4. חשוב: לבנות מחדש את הגרסה האמיתית לפני push
python app/build.py
```

## בדיקות ניווט

```
python app/fence_check.py                 # בלי פרוזדורי הכניסה, מתחם ההופעות מנותק לגמרי (אין חציית גדר)
node app/tests/routes-shortest.js         # כל 2,550 זוגות הנקודות: נגישות, והשוואה למסלול הקצר ביותר האפשרי
```

## מבחן עומס: כמה מכשירים בו-זמנית

```
python app/tests/fakebase.py                                   # Firebase מדומה
CLOUD_CONFIG=app/tests/cloud-test-config.json python app/build.py
python -m http.server 8765 --bind 127.0.0.1 -d docs
TRACE=1 node app/tests/stress.js <seed> 100                    # מחשב (2 לשוניות) + טלפון, 100 פעולות אקראיות
PARALLEL=1 TRACE=1 node app/tests/stress.js <seed> 100         # כמה ריצות במקביל (משתמש נפרד לכל seed)
python app/build.py                                            # חשוב: לבנות מחדש את הגרסה האמיתית
```
בכל ריצה: עריכות, מחיקות, ניתוקי קליטה, יציאה/חזרה, רענון וסגירה/פתיחה. בסוף בודקים שכל המכשירים והענן זהים
בדיוק למה שהמשתמש השאיר – שום דבר לא אבד ושום דבר שנמחק לא חזר.
