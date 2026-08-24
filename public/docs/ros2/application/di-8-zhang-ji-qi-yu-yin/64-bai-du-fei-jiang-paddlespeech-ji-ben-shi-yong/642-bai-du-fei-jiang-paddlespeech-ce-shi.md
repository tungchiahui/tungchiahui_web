### 6.4.2 百度飞桨PaddleSpeech测试

PaddleSpeech安装成功后，其使用方式有两种，一种是调用API库，另一种是以服务的方式调用。

#### 1.API调用

在测试之前，需要先做一些准备工作，请启动一个终端，并输入如下指令：

```
mkdir aistudio
cd aistudio
wget -P data https://paddlespeech.bj.bcebos.com/Parakeet/tools/nltk_data.tar.gz
tar zxvf data/nltk_data.tar.gz
```

##### （1）测试语音转文字

请先下载音频实例到aistudio目录下：

```
wget -c https://paddlespeech.bj.bcebos.com/PaddleAudio/zh.wav
```

在aistudio目录下新建ASR.py文件并输入如下内容：

```
from paddlespeech.cli.asr.infer import ASRExecutor
asr = ASRExecutor()
result = asr(audio_file="zh.wav",model='conformer_wenetspeech')
print(result)
```

调用如下指令执行ASR.py文件：

```
python3 ASR.py
```

执行结果如下图所示，会将音频文件的内容转换成文本并输出在终端。

![](/assets/6.4.2_语音转文字.png)

##### （2）测试文字转语音

在aistudio目录下新建TTS.py文件并输入如下内容：

```
from paddlespeech.cli.tts.infer import TTSExecutor
tts = TTSExecutor()
tts(text="今天天气十分不错。", output="output.wav")
```

调用如下指令执行TTS.py文件：

```
python3 TTS.py
```

执行完毕后，会在当前目录下生成一个名为output.wav的音频文件，播放该文件，播报内容为：”今天天气十分不错“。

#### 2.服务调用

##### （1）启动PaddleSpeech服务

在PaddleSpeech目录下，执行如下指令以启动服务：

```
paddlespeech_server start --config_file ./demos/speech_server/conf/application.yaml
```

##### （2）**访问语音转文字服务**

在aistudio目录下，执行如下指令：

```
paddlespeech_client asr --server_ip 127.0.0.1 --port 8090 --input zh.wav
```

终端将输出语音转换完毕的文本信息。

##### （3）**访问文本转语音服务**

终端下执行如下指令：

```
paddlespeech_client tts --server_ip 127.0.0.1 --port 8090 --input "您好，欢迎使用百度飞桨语音合成服务。" --output output.wav
```

执行完毕后，会在当前目录下生成一个名为output.wav的音频文件，播放该文件，播报内容为：”您好，欢迎使用百度飞桨语音合成服务“。

