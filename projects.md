---
layout: default
redirect_from:
  - /projects
---

## Projects

* [bbox-visualizer](https://github.com/shoumikchow/bbox-visualizer) is a library that can be used to draw bounding boxes around objects as well as label them. This tries to solve the pain points of positioning the label according to the bounding boxes which requires some annoying math to make it look good. 

  This library helps make that very easy. You just use the bounding box locations and their corresponding labels and the library takes care of everything. Additionally, there are some other cool visualizations that you can use other than the standard label on top of the boxes.  
  
  The library reached the [front page of Hacker News](https://news.ycombinator.com/item?id=24608662) and was featured on the [Python Bytes](https://pythonbytes.fm/episodes/show/202/jupyter-is-back-in-black) podcast.

  [[Documentation]](https://bbox-visualizer.rtfd.io)

* [Suicide Prevention Bot](https://github.com/shoumikchow/suicide-prevention-bot) is a Twitter bot that replies to bots that are suicidal with phone number of the [National Suicide Prevention Lifeline](https://suicidepreventionlifeline.org/) and the [Crisis Text Line](https://www.crisistextline.org/). It also gave a link to [Befrienders Worldwide](https://www.befrienders.org/) which has a database for suicide prevention hotline numbers outside of the US.

  The bot looks for keywords in the Twitter stream and then replies to those tweets. However, the bot does not have the ability to differentiate between tweets that are sarcastic and those that are actually suicidal. In order to slightly alleviate this, the bot performs a very simple sentiment analysis and only replies to tweets that are tagged as negative but this does not get rid of the false positives entirely.

  The bot was, unfortunately, flagged as spammy by Twitter which, one could argue, it is because it finds relevant tweets very often. But I think a bot that has the potential to save lives should not be tagged as spammy. If there's anyone at Twitter (or a Twitter Developer Advocate) reading this, I'd love to talk to you about it. Please reach out!

* Other projects can be found on my [Github](/github)


[back](https://shoumikchow.com)