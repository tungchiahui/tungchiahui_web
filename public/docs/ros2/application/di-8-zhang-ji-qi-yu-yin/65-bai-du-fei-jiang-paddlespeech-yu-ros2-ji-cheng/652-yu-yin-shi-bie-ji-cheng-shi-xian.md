### 6.5.2 语音识别集成实现

#### 0.准备工作

请在当前工作空间准备一个名为 input.wav 的音频文件以作备用。

#### 1.语音识别核心实现

功能包ros2\_ps\_bridge的src目录下，新建文件v2t.py，并编辑文件，输入如下内容：

```py
import rclpy
from rclpy.node import Node
from std_msgs.msg import String
from paddlespeech.cli.asr.infer import ASRExecutor

class V2T(Node):
    def __init__(self):
        super().__init__("v2t_node")
        self.get_logger().info("语音转文字并发布节点创建")
        asr = ASRExecutor()
        result = asr(audio_file="input.wav",model='conformer_wenetspeech')

        self.get_logger().info("识别的文字为:%s"%result)

        self.pub_ = self.create_publisher(String,"asr_string",10)
        msg = String()
        msg.data = result
        self.pub_.publish(msg)

def main():
    rclpy.init()

    demo = V2T()
    rclpy.spin(demo)

    rclpy.shutdown()

if __name__ == '__main__':
    main()
```

#### 2.编辑配置文件

setup.py 中的配置如下：

```Cmake
entry_points={
    'console_scripts': [
        'v2t = ros2_ps_bridge.v2t:main',
    ],
},
```

#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select ros2_ps_bridge
```

#### 4.执行

新建一个终端，打印订阅到的语音转文本相关话题数据，指令如下：

```
ros2 topic echo /asr_string
```

当前工作空间下，再启动一个终端，并输入如下指令：

```
. install/setup.bash
ros2 run ros2_ps_bridge v2t
```

程序正常执行后，将在第一个终端中输出input.wav中对用的文本内容。

