### 6.5.3 语音合成集成实现

#### 1.语音合成核心实现

功能包ros2\_ps\_bridge的ros2\_ps\_bridge目录下，新建Python文件t2v.py，并编辑文件，输入如下内容：

```py
import rclpy
from rclpy.node import Node
from std_msgs.msg import String
from paddlespeech.cli.tts.infer import TTSExecutor
from playsound import playsound


class T2V(Node):
    def __init__(self):
        super().__init__("t2v_node")
        self.get_logger().info("文字转语音并播报节点创建")

        self.sub_ = self.create_subscription(String,"asr_string",self.callback,10)

    def callback(self,msg):
        self.data = msg
        self.get_logger().info("订阅到的消息为:%s"%self.data.data)
        temp = str(self.data.data)
        tts = TTSExecutor()
        tts(text=temp, output="output.wav")
        playsound('output.wav')

def main():
    rclpy.init()
    demo = T2V()
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
        't2v = ros2_ps_bridge.t2v:main'
    ],
},
```

#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select ros2_ps_bridge
```

#### 4.执行

当前工作空间下，启动终端，并输入如下指令：

```
. install/setup.bash
ros2 run ros2_ps_bridge t2v
```

再新建一个终端，可以发布要被合成为语音的文本，指令如下：

```
ros2 topic pub /asr_string std_msgs/msg/String '{data: "我是百度 语音小助手"}' -1
```

如无异常，第一个终端会播放第二个终端发布文本的对应语音。

