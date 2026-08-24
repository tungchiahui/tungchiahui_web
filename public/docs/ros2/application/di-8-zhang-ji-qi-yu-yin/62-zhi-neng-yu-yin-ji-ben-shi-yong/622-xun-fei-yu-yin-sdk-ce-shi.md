### 6.2.2 讯飞语音SDK安装

#### 1.设置共享库

解压**6.2.1 讯飞语音SDK下载**一节中下载的SDK压缩文件，不出意外你能看到以下内容：

![](/assets/image-20240303194205497.png)

然后，在终端下进入`libs/x64`目录，拷贝库文件`libmsc.so`到`usr/lib`目录下，指令如下：

```
# 在libs/x64目录下
sudo cp libmsc.so /usr/lib/
sudo ldconfig
```

上述指令会将`libmsc.so`设置为共享库，另外需要注意这里的库文件和APPID是绑定的，在科大讯飞官网每创建一个应用的时候会生成一个APPID，并且生成对应的库文件，这意味着库文件是不可共享的。

#### 2.安装依赖

调用如下指令安装依赖：

```
sudo apt install libasound2-dev
sudo apt install sox
```

上述指令安装了音频应用程序开发的依赖包libasound2-dev和音频处理工具sox。

