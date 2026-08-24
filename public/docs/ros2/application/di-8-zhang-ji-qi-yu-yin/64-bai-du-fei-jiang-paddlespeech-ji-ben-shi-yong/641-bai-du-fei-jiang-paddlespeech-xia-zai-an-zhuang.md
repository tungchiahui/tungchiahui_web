### 6.4.1 百度飞桨paddlespeech下载安装

#### 1.安装Python3和paddlepaddle

在使用paddlespeech时，需要先安装Python3和paddlepaddle，且对二者安装版本有要求，针对我们当前环境（Ubuntu 22.04），官方建议**Python&gt;=3.8**、**paddlepaddle&lt;=2.5.1**。

请先调用如下指令安装Python3：

```
sudo apt install python3.10
```

安装并指定`paddlepaddle`版本，下面版本是`cpu`版本的示例：

```
pip install paddlepaddle==2.5.1 -i https://mirror.baidu.com/pypi/simple
```

#### 2.安装PaddleSpeech

PaddleSpeech有两种快速安装方法，一种是pip安装，另一种是源码编译（官方推荐）。

**（1）pip安装**

pip安装指令如下：

```
pip install pytest-runner
pip install paddlespeech
```

**（2）源码安装**

源码安装指令如下：

```
git clone https://github.com/PaddlePaddle/PaddleSpeech.git
cd PaddleSpeech
pip install pytest-runner
pip install .
```

#### 3.安装其他依赖

PaddleSpeech执行时还需要依赖于libssl1.1，其安装指令如下：

```
echo "deb http://security.ubuntu.com/ubuntu focal-security main" | sudo tee /etc/apt/sources.list.d/focal-security.list
sudo apt update
sudo apt install libssl1.1
```



