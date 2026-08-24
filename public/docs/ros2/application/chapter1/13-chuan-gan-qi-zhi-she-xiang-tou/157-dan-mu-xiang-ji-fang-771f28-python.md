### 1.6.6 单目相机仿真\(Python\)

#### 1.发布方实现

功能包py03\_camera的py03\_camera目录下，新建Python文件sim\_camera.py，并编辑文件，输入如下内容：

```py
"""  
    需求：模拟相机，发布一张图片。
    流程：
        1.导包；
        2.初始化ROS2客户端；
        3.自定义节点类；
          3-1.创建图片发布方；
          3-2.创建定时器循环发布图片。             
        4.调用spin函数，并传入节点对象；
        5.资源释放。 


"""
# 1.导包；
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Image
import numpy

# 3.自定义节点类；
class SimCamera(Node):
    def __init__(self):
        super().__init__("sim_camera_node_py")
        # 3-1.创建图片发布方；
        self.image_pub = self.create_publisher(Image,"image",10)
        # 3-2.创建定时器循环发布图片。
        self.timer = self.create_timer(1.0,self.on_timer)

    def on_timer(self):
        # 组织数据
        image = Image()
        image.header.stamp = self.get_clock().now().to_msg()
        image.header.frame_id = "camera"

        image.encoding = "rgb8"
        image.width = 640
        image.height = 480

        image.step = image.width * 3

        image_data = numpy.zeros((image.height,image.width,3),dtype=numpy.uint8)
        image_data[:image.height // 3,:,:] = [255,0,0]
        image_data[image.height // 3 : image.height // 3 * 2,:,:] = [0,255,0]
        image_data[image.height // 3 * 2:,:,:] = [0,0,255]

        image.data = image_data.tobytes()

        # 发布
        self.image_pub.publish(image)

def main():
    # 2.初始化ROS2客户端；
    rclpy.init()
    # 4.调用spain函数，并传入节点对象；
    rclpy.spin(SimCamera())
    # 5.资源释放。 
    rclpy.shutdown()

if __name__ == '__main__':
    main()
```

#### 2.编辑配置文件

##### 1.package.xml {#1packagexml}

在创建功能包时，所依赖的功能包已经自动配置了，配置内容如下：

```xml
<depend>rclpy</depend>
<depend>sensor_msgs</depend>
```

##### 2.setup.py {#2setuppy}

setup.py文件中`entry_points`字段的`console_scripts`中添加如下内容：

```python
entry_points={
    'console_scripts': [
        'sim_camera = py03_camera.sim_camera:main'
    ],
},
```

#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select py03_camera
```

#### 4.执行

当前工作空间下，启动终端，并输入如下指令：

```
. install/setup.bash
ros2 run py03_camera sim_camera
```

#### 5.使用rviz2查看结果

新建终端，输入如下指令：

```
rviz2
```

rviz2启动后，添加image插件并将话题设置为"/image"，最终运行结果与演示案例类似。

