### 6.2.3 讯飞语音SDK测试

在讯飞语音SDK的`samples`目录中，已经内置了测试示例，直接使用即可。

#### 1.语音识别测试

语音识别对应的是`samples/iat_online_record_sample`项目，终端下进入该目录，执行如下指令对项目进行构建：

```
source 64bit_make.sh
```

构建成功后，将在SDK的`bin`目录下生成名为`iat_online_record_sample`可执行文件，终端下进入该目录，并调用如下指令：

```
./iat_online_record_sample
```

接下来按照提示输入选项，就可以从电脑的麦克风读取音频了，并且还会输出识别到的文字到终端。

![](/assets/6.3.3_01语音识别测试.PNG)

#### 2.语音合成测试

语音合成对应的是`samples/tts_online_sample`项目，终端下进入该目录，执行如下指令对项目进行构建：

```
source 64bit_make.sh
```

构建成功后，将在SDK的`bin`目录下生成名为`tts_online_sample`可执行文件，终端下进入该目录，并调用如下指令：

```
./tts_online_sample
```

接下来程序执行会将其内置的文本合成为语音，执行过程如下图。

![](/assets/6.3.3_02语音合成测试.PNG)

最后还会将合成结果输出到名为`tts_sample.wav`的音频文件，我们也可以音频播放器播放该文件内容。

![](/assets/6.3.3_03语音合成测试.PNG)

