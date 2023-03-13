var lang = require("./lang.js");

function supportLanguages() {
  return lang.supportLanguages.map(([standardLang]) => standardLang);
}

function translate(query, completion) {
  const queryTxt = query.text.replace(" ", "").replace("，", "，\r\n").replace("。", "。\r\n").replace(",", ",\r\n").replace(".", ".\r\n").trim();
  let whatPrompt = `这个 "${queryTxt}" 可能是什么，请按照json格式回答，key值有Maybe和Desc，Maybe回答他最可能是的东西（要求精确些），Desc回答这个东西的描述;\n` + 
                   `答案应该使用中文。`;
  if ($option.back_language === "en") {
    whatPrompt = `What is "${queryTxt}" might be? please answer in JSON format with key values of 'Maybe' and 'Desc'. \n` + 
                  `'Maybe' should provide the most likely thing it is (be more precise), \n` + 
                  `while 'Desc' should describe what this thing is. \n` + 
                  `And you answer must be english.`;
  };
  (async () => {
    const targetTxt = await post_openai(whatPrompt);
    if (targetTxt.error) {
      completion(targetTxt);
      return;
    }
    try {
      backData = JSON.parse(targetTxt);
      $log.info(`返回结果是 JSON: ${JSON.stringify(backData)}`);
    } catch {
      $log.info(`返回结果不是 JSON: ${JSON.stringify(targetTxt)}`);
      if ($option.back_language === "en") {
        maybePrompt = `What is "${queryTxt}" most likely to be? (Please try to answer more precisely.)`
        desc_prompt = `Describe what "${queryTxt}" most likely to be`
      } else {
        maybePrompt = `这个 "${queryTxt}" 最可能是什么？（要求精确些）`
        desc_prompt = `描述 "${queryTxt}" 最可能是什么`
      }
      const maybeTxt = await post_openai(maybePrompt);
      const descTxt = await post_openai(desc_prompt);
      if (maybeTxt.error) {
        completion(maybeTxt);
        return;
      }
      if (descTxt.error) {
        completion(descTxt);
        return;
      }
      backData = {
        Maybe: maybeTxt,
        Desc: descTxt,
      };
    }
    
    completion({
      result: {
        from: query.detectFrom,
        to: query.detectTo,
        toParagraphs: [backData.Desc],
        toDict: {
          additions: [
            { name: "What", value: queryTxt },
            { name: "Maybe", value: backData.Maybe }
          ],
        },
      },
    });

  })().catch((err) => {
    completion({
      error: {
        type: err._type || "unknown",
        message: err._message || "未知错误",
        addition: err._addition,
      },
    });
  });
}

async function post_openai(prompt) {
  const header = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${$option.api_key}`,
  };
  const body = {
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: prompt }],
  };
  const resp = await $http.request({
    method: "POST",
    url: $option.api_url + "/v1/chat/completions",
    header,
    body,
  });
  if (resp.error) {
    const { statusCode } = resp.response;
    let reason;
    if (statusCode >= 400 && statusCode < 500) {
      reason = "param";
    } else {
      reason = "api";
    }
    return {
      error: {
        type: reason,
        message: `接口响应错误 - ${resp.data.error.message}`,
        addition: JSON.stringify(resp),
      },
    };
  } else {
    const { choices } = resp.data;
    if (!choices || choices.length === 0) {
      return {
        error: {
          type: "api",
          message: "接口未返回结果",
        },
      };
    }
    return choices[0].message.content.trim();
  }
}

exports.supportLanguages = supportLanguages;
exports.translate = translate;